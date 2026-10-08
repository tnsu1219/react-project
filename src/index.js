import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const username = process.env.AFRICAS_TALKING_USERNAME;
const apiKey = process.env.AFRICAS_TALKING_API_KEY;
const itPhone = process.env.IT_SUPPORT_PHONE;

app.post('/api/send-it-alert', async (req, res) => {
  try {
    const { issueType, title, description, department, reporterEmail } = req.body;

    const message = [
      'Hello IT Support,',
      `Finance needs help with: ${issueType}`,
      `Issue title: ${title || 'Support request'}`,
      `Details: ${description || 'No additional details provided.'}`,
      `Department: ${department || 'Finance'}`,
      `Reporter email: ${reporterEmail || 'Not provided'}`,
      'Please assist as soon as possible.'
    ].join('\n');

    const response = await axios({
      method: 'post',
      url: 'https://api.africastalking.com/version1/messaging',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'apiKey': apiKey,
        'Accept': 'application/json'
      },
      data: new URLSearchParams({
        username,
        to: itPhone,
        message
      }).toString()
    });

    console.log('SMS sent:', response.data);
    return res.status(200).json({ success: true, data: response.data });
  } catch (error) {
    console.error('SMS error:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to send SMS',
      details: error.response?.data || error.message
    });
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});