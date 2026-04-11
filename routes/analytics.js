const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const User = require('../models/User');
const auth = require('../middleware/auth');

// @route   GET api/analytics
// @desc    Get basic analytics data (Total messages, Total users)
router.get('/', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    
    const chats = await Chat.find();
    let totalMessages = 0;
    chats.forEach(chat => {
      totalMessages += chat.messages.length;
    });

    res.json({
      totalUsers,
      totalMessages,
      totalConversations: chats.length
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;
