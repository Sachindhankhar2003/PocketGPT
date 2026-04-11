const express = require('express');
const router = express.Router();
const multer = require('multer');
const { PDFParse } = require('pdf-parse');
const auth = require('../middleware/auth');
const Chat = require('../models/Chat');

// Set up Multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// @route   POST api/docs/upload/:chatId
// @desc    Upload document and attach text context to chat
router.post('/upload/:chatId', auth, upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ msg: 'No file uploaded' });
    }

    let parsedText = '';

    if (req.file.mimetype === 'application/pdf') {
      // pdf-parse v2 API
      const parser = new PDFParse({ data: req.file.buffer });
      const result = await parser.getText();
      parsedText = result.text;
      await parser.destroy();
    } else if (req.file.mimetype === 'text/plain') {
      parsedText = req.file.buffer.toString('utf-8');
    } else {
      return res.status(400).json({ msg: 'Unsupported file type. Use PDF or TXT.' });
    }

    // Append context to the chat
    const chat = await Chat.findOne({ _id: req.params.chatId, userId: req.user.id });
    if (!chat) {
      return res.status(404).json({ msg: 'Chat not found or unauthorized' });
    }

    // Limit context length slightly to avoid massive token bills
    const maxChars = 20000; 
    let contextAttachment = `\n[DOCUMENT UPLOADED - Name: ${req.file.originalname}]\n`;
    contextAttachment += parsedText.substring(0, maxChars);
    if (parsedText.length > maxChars) contextAttachment += '\n...[Text truncated due to length]...';

    // Store in systemContext field
    chat.systemContext = (chat.systemContext || '') + contextAttachment;
    await chat.save();

    res.json({ msg: 'Document processed and context added to chat', title: req.file.originalname });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error processing document');
  }
});

module.exports = router;

