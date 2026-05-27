"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const os = require("os");

const CLOUDFLARED_VERSION = "2024.1.5"; // You can pin to a known version

async function downloadCloudflared() {
    const binDir = path.join(__dirname, "bin");
    const exeExt = os.platform() === "win32" ? ".exe" : "";
    const binPath = path.join(binDir, `cloudflared${exeExt}`);

    if (fs.existsSync(binPath)) {
        return binPath;
    }

    if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
    }

    console.log("[TUNNEL] cloudflared binary not found. Downloading...");

    let platform = os.platform();
    let arch = os.arch();

    let downloadUrl = "";

    // Map Node.js platform/arch to Cloudflare's release names
    if (platform === "darwin") {
        downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz"; // macOS universal usually
    } else if (platform === "linux") {
        if (arch === "arm64") {
            downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64";
        } else if (arch === "arm") {
            downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm";
        } else {
            downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64";
        }
    } else if (platform === "win32") {
        downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe";
    } else {
        throw new Error(`Unsupported OS: ${platform}-${arch}`);
    }

    // Since macOS download is a .tgz, we need a special handler for it.
    // For simplicity in this script, we'll use the direct binary links where possible, 
    // or rely on a simple curl/tar execution for darwin if needed.
    if (platform === "darwin") {
        // macOS provides a brew tap or a tgz. To keep it simple, we can download the tgz and extract it.
        const tarPath = path.join(binDir, "cloudflared.tgz");
        await downloadFile(downloadUrl, tarPath);
        
        // Extract it
        const { execSync } = require("child_process");
        execSync(`tar -xzf "${tarPath}" -C "${binDir}"`);
        fs.unlinkSync(tarPath);
    } else {
        await downloadFile(downloadUrl, binPath);
    }

    if (platform !== "win32") {
        fs.chmodSync(binPath, 0o755); // Make executable
    }

    console.log("[TUNNEL] cloudflared download complete:", binPath);
    return binPath;
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
            }
            if (response.statusCode !== 200) {
                return reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err));
        });
    });
}

module.exports = { downloadCloudflared };
