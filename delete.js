// deleteVideo.js
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Get the API key from environment variables
const apiKey = process.env.API_KEY;

// Get the video UUID from command line arguments
const videoUUID = process.argv[2];

if (!videoUUID) {
  console.error('Please provide a video UUID as an argument');
  process.exit(1);
}

const url = `https://api.synthesia.io/v2/videos/${videoUUID}`;

// Set up the request headers
const headers = {
  'accept': 'application/json',
  'Authorization': apiKey
};

// Send DELETE request
axios.delete(url, { headers })
  .then(response => {
    console.log('Deleted', response.data);
  })
  .catch(error => {
    console.error('Error:', error.response ? error.response.data : error.message);
  });