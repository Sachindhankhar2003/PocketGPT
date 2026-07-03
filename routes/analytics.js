const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const User = require('../models/User');
const auth = require('../middleware/auth');

// @route   GET api/analytics
// @desc    Get analytics data — total messages, users, conversations,
//          active users (last 7 days), and avg messages per conversation.
router.get('/', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();

    // Active users: registered within the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const activeUsers = await User.countDocuments({
      createdAt: { $gte: sevenDaysAgo },
    });

    const chats = await Chat.find();
    let totalMessages = 0;
    chats.forEach((chat) => {
      totalMessages += chat.messages.length;
    });

    const totalConversations = chats.length;
    const avgMessagesPerConversation =
      totalConversations > 0
        ? parseFloat((totalMessages / totalConversations).toFixed(2))
        : 0;

    res.json({
      totalUsers,
      activeUsers,
      totalMessages,
      totalConversations,
      avgMessagesPerConversation,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;

