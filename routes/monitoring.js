const express = require("express");

const router = express.Router();

const DEVICES = require("../stores/devices");

router.get("/monitoring", (req, res) => {

    res.json(DEVICES);
});

module.exports = router;