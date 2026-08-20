const express = require("express");
const router = express.Router();
const iclockController = require("../controllers/iclockController");

// The eSSL machine sends raw text instead of JSON, so we need a raw body parser for these routes
router.use(express.text({ type: "*/*" }));

// eSSL Standard ADMS Endpoints
// Handshake & command check
router.get("/cdata", iclockController.handshake);
router.get("/getrequest", iclockController.handshake);
router.post("/devicecmd", iclockController.handshake);

// Main endpoint where the machine pushes attendance logs
router.post("/cdata", iclockController.receiveData);

module.exports = router;
