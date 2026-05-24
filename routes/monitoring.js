const express = require("express");

const router = express.Router();

const DEVICES = require("../deviceStore");

router.get("/monitoring", (req, res) => {

    res.json(DEVICES);
});

module.exports = router;