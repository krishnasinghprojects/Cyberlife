"use strict";

const axios = require("axios");
const { buildTools, buildSystemPrompt } = require("./toolRegistry");
const { executeTool } = require("./toolExecutor");

// ══════════════════════════════════════════════════════════════════════════════
// Agentic Loop
//
// The core execution loop that turns a simple chat LLM into an autonomous
// agent. For each user prompt:
//
//   1. Build system prompt + tools from live DEVICES state
//   2. Call Ollama /api/chat with messages + tools
//   3. If the AI returns tool_calls → execute them → feed results back → repeat
//   4. If the AI returns plain text → we're done
//   5. Cap at MAX_ITERATIONS to prevent runaway loops
//
// The response includes a full "tool trace" so the UI can display badges
// showing what tools the AI called and what it found.
// ══════════════════════════════════════════════════════════════════════════════

const MAX_ITERATIONS    = 10;
const MAX_RESULT_LENGTH = 4000;   // Truncate large tool results to protect context window
const OLLAMA_TIMEOUT    = 120_000; // 2 min per LLM call

/**
 * runAgentLoop(prompt, history, config)
 *
 * @param {string}   prompt   — The user's message
 * @param {object[]} history  — Previous chat messages [{ role, content }, ...]
 * @param {object}   config   — Hub config (OLLAMA_URL, OLLAMA_DEFAULT_MODEL, HUB_PORT, etc.)
 * @returns {Promise<object>} — { response, toolTrace, iterations, model, responseTime }
 */
async function runAgentLoop(prompt, history, config) {

    const ollamaUrl = config.OLLAMA_URL           || "http://127.0.0.1:11434";
    const model     = config.OLLAMA_DEFAULT_MODEL  || "llama3.1:8b";
    const hubPort   = config.HUB_PORT              || 8000;

    // ── Build dynamic context ────────────────────────────────────────
    const systemPrompt = buildSystemPrompt();
    const tools        = buildTools();

    // ── Build initial message array ──────────────────────────────────
    const messages = [
        { role: "system", content: systemPrompt },
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: "user", content: prompt }
    ];

    const toolTrace = [];
    let iterations  = 0;
    const startTime = Date.now();

    // ── 1. Discover Inference Node ───────────────────────────────────
    const DEVICES = require("../stores/devices");
    const allDevices = Object.values(DEVICES);
    
    // Find any online device that supports ai-inference
    const inferenceNode = allDevices.find(d => 
        d.status === "online" && 
        d.capabilities?.includes("ai-inference")
    );

    let targetUrl;
    if (inferenceNode) {
        // Route through our own proxy to the remote node securely
        targetUrl = `http://127.0.0.1:${hubPort}/ai-chat/${encodeURIComponent(inferenceNode.uid)}`;
        console.log(`[AGENT] Selected inference node: ${inferenceNode.uid}`);
    } else {
        // Fallback to direct URL (e.g. if Hub is running Ollama locally)
        targetUrl = `${ollamaUrl}/api/chat`;
        console.log(`[AGENT] No ai-inference nodes found. Falling back to direct URL: ${targetUrl}`);
    }

    // ── Agent loop ───────────────────────────────────────────────────
    while (iterations < MAX_ITERATIONS) {
        iterations++;

        // Build Ollama payload
        const payload = {
            model,
            messages,
            stream: false
        };

        if (tools.length > 0) {
            payload.tools = tools;
        }

        // Call LLM
        let ollamaResponse;
        try {
            const resp = await axios.post(
                targetUrl,
                payload,
                { timeout: OLLAMA_TIMEOUT }
            );
            ollamaResponse = resp.data;
        } catch (err) {
            const msg = err.response?.data?.error || err.message;
            throw new Error(`Ollama inference failed: ${msg}`);
        }

        const assistantMessage = ollamaResponse.message;
        if (!assistantMessage) {
            throw new Error("Ollama returned an empty message — check model availability.");
        }

        // ── Check if the AI wants to call tools ─────────────────────
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {

            // Append the assistant's message (with tool_calls) to the conversation
            messages.push(assistantMessage);

            // Execute each tool call sequentially
            for (const toolCall of assistantMessage.tool_calls) {
                const fnName = toolCall.function.name;

                // Handle arguments — Ollama may return string or object
                let fnArgs = toolCall.function.arguments || {};
                if (typeof fnArgs === "string") {
                    try { fnArgs = JSON.parse(fnArgs); } catch { fnArgs = {}; }
                }

                console.log(`[AGENT] Tool call #${iterations}: ${fnName}(${JSON.stringify(fnArgs)})`);

                const toolStart = Date.now();
                const result    = await executeTool(fnName, fnArgs, hubPort);
                const duration  = Date.now() - toolStart;

                // Truncate large results to protect the context window
                let resultStr = JSON.stringify(result);
                if (resultStr.length > MAX_RESULT_LENGTH) {
                    resultStr = resultStr.substring(0, MAX_RESULT_LENGTH) + "\n... [result truncated for context limit]";
                }

                // Record in the trace (for UI display)
                toolTrace.push({
                    tool:     fnName,
                    args:     fnArgs,
                    result:   result,
                    duration: `${duration}ms`
                });

                // Append tool result to conversation for Ollama
                messages.push({
                    role:    "tool",
                    content: resultStr
                });

                console.log(`[AGENT] ← ${fnName} result (${duration}ms): ${resultStr.substring(0, 150)}...`);
            }

            // Continue the loop — let the AI process the tool results
            continue;
        }

        // ── No tool calls — final text response ─────────────────────
        const elapsed = Date.now() - startTime;

        return {
            response:     assistantMessage.content || "No response generated.",
            toolTrace,
            iterations,
            model,
            responseTime: `${elapsed}ms`
        };
    }

    // ── Hit max iterations ───────────────────────────────────────────
    const elapsed = Date.now() - startTime;

    // Try to extract the last meaningful content
    const lastAssistantMsg = [...messages].reverse().find(m => m.role === "assistant" && m.content);

    return {
        response: lastAssistantMsg?.content
            || "I've reached the maximum number of tool-calling iterations. Please check the tool results above for the data I gathered.",
        toolTrace,
        iterations,
        model,
        responseTime:          `${elapsed}ms`,
        maxIterationsReached:  true
    };
}

module.exports = { runAgentLoop };
