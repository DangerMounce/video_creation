import axios from "axios";
import chalk from "chalk";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { spinner } from "./modules/display.js";

// Load environment variables from .env file
dotenv.config();

// Define __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiKey = process.env.API_KEY;
const apiURL = 'https://api.synthesia.io/v2/videos';

const args = process.argv.slice(2)
const videoName = args[0]


async function downloadVideo(url, filename) {
  const downloadsFolder = path.join(__dirname, 'downloads');
  if (!fs.existsSync(downloadsFolder)) {
    fs.mkdirSync(downloadsFolder);
  }

  const filePath = path.join(downloadsFolder, filename);

  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  });

  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);
    let error = null;
    writer.on('error', err => {
      error = err;
      writer.close();
      reject(err);
    });
    writer.on('close', () => {
      if (!error) {
        resolve();
      }
    });
  });
}


async function getVideoStatus(videoId) {
  try {
    const response = await axios.get(`${apiURL}/${videoId}`, {
      headers: { 
        accept: 'application/json', 
        Authorization: apiKey 
      }
    });
    console.log(response.data)
  } catch (error) {
    console.error('Error getting video status:', error);
    throw error;
  }
}






getVideoStatus(videoName)