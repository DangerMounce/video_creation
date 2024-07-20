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

if (!videoName) {
  console.log(chalk.bold.red('Error: '), 'Missing filename.')
  process.exit(1)
}

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
    return response.data;
  } catch (error) {
    console.error('Error getting video status:', error);
    throw error;
  }
}

async function createVideo(videoData) {
  try {
    const response = await axios.post(apiURL, videoData, {
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        Authorization: apiKey
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error creating video:', error);
    throw error;
  }
}

async function generateVideoData() {
  return {
    test: 'true',
    visibility: 'private',
    input: [
      {
        avatarSettings: {horizontalAlign: 'center', scale: 1, style: 'rectangular', seamless: false},
        backgroundSettings: {
          videoSettings: {
            shortBackgroundContentMatchMode: 'freeze',
            longBackgroundContentMatchMode: 'trim'
          }
        },
        avatar: '49dc8f46-8c08-45f1-8608-57069c173827',
        background: 'warm_white',
        scriptText: `This is a test video.`
      }
    ]
  };
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getVideo() {
  spinner.generatingVideoAnimation()
  try {
    const videoData = await generateVideoData();
    const synthesiaData = await createVideo(videoData);
    
    let status;
    while (true) {
      status = await getVideoStatus(synthesiaData.id);
      if (status.status === 'complete') {
        spinner.stopAnimation()
        console.clear()
        //console.log(chalk.bold.yellow(('Video complete. Download URL:', status.download)));
         // Extract the file extension from the download URL
         const fileExtension = path.extname(new URL(status.download).pathname);
         const filename = `${videoName}${fileExtension}`;
         
         // Download the video
         await downloadVideo(status.download, filename);
         console.log(chalk.bold.green((`Video downloaded and saved as ${filename}`)));
        break;
      }
      // console.log('Video is not yet complete. Checking again in 3 seconds...');
      await delay(3000); // Wait for 3 seconds before checking again
    }
  } catch (error) {
    console.error('Error in getVideo function:', error);
  }
}



getVideo();