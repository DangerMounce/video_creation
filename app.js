// This script will take in a value of true or false for testing.
// It'll go through each of the scripts in the script dir
// It'll send through the script to the synthesia API
// Once done, it'll use the script filename to name the video and download it to downloads.

import axios from "axios";
import chalk from "chalk";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import inquirer from 'inquirer'
import { readdir, readFile } from 'fs/promises';
import { extname, join } from 'path';
import logger from "./logger.js";


// Load environment variables from .env file
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiKey = process.env.API_KEY;
const apiURL = 'https://api.synthesia.io/v2/videos';

const args = process.argv.slice(2);
const instruction = args[0]
let uuid = args[1]
const newTitle = args[2]

async function addApiKeyToEnvFile(apiKey) {
    const envFilePath = path.resolve(process.cwd(), '.env');
  
    let envFileContent = '';
  
    // Check if the .env file exists
    if (fs.existsSync(envFilePath)) {
      // Read the contents of the .env file
      envFileContent = fs.readFileSync(envFilePath, 'utf8');
  
      // Split the content into lines
      const lines = envFileContent.split('\n');
  
      // Check if the API_KEY exists and update it if it does
      let apiKeyExists = false;
      const updatedLines = lines.map(line => {
        if (line.startsWith('API_KEY=')) {
          apiKeyExists = true;
          return `API_KEY=${apiKey}`;
        }
        return line;
      });
  
      // If API_KEY does not exist, add it
      if (!apiKeyExists) {
        updatedLines.push(`API_KEY=${apiKey}`);
      }
  
      // Join the lines back into a single string
      envFileContent = updatedLines.join('\n');
    } else {
      // Create the .env file with the API_KEY
      envFileContent = `API_KEY=${apiKey}\n`;
    }
  
    // Write the content back to the .env file
    fs.writeFileSync(envFilePath, envFileContent, 'utf8');
    logger.app_says('API Key added to .env file')
    await delay(100)
    process.exit(1)
  }


// This function confirms if video should be a test
async function isTestVideo() {
    console.clear('')
    try {
        const answers = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmation',
                message: chalk.bold.yellow('Mark this run as drafts?'),
                default: true // Set default value as needed
            }
        ]);

        const confirmation = answers.confirmation;
        if (confirmation) {
            logger.user_message('Job queue is marked as a test run.')
        } else {
            logger.user_message('Job queue is marked as a live run.')
        }
        return confirmation

    } catch (error) {
        logger.error(`function isTestVideo error - ${error.message}`)
        console.error(chalk.red(`Error: ${error.message}`));
        exitAfterDelay(2000)
    }
}

// This function counts the number of DOC files in the scripts directory.
async function countScriptsIn(directory) {
    try {
        const files = await readdir(directory);
        const docFiles = files.filter(file => extname(file).toLowerCase() === '.docx');
        logger.error(`${docFiles.length} script files found in ${directory} directory.`)
        return docFiles.length;
    } catch (error) {
        logger.error(`function countScriptsIn error - ${error}`)
        console.error('Error reading directory:', error);
        exitAfterDelay(2000)
        return 0;
    }
}

// This function reads the scripts from each DOCX file.
async function readScripts(directory) {
    const numberOfScripts = await countScriptsIn(directory)
    if (numberOfScripts === 0) {
        console.log(chalk.red(`${numberOfScripts} found in scripts directory.`))
        process.exit(1)
    } else {
        try {
            const files = await readdir(directory);
            const scripts = [];

            for (const file of files) {
                const filePath = join(directory, file);
                const content = await readFile(filePath, 'utf-8');
                scripts.push({ fileName: file, script: content });
            }

            return scripts;
        } catch (error) {
            logger.error(`function readScripts error - ${error}`)
            console.error('Error reading directory or files:', error);
            return [];
        }
    }
}

// This function return an array of objects with the video filename and the script for each file contained in scripts.
async function getVideoData() {
    const data = await readScripts('scripts')
    return data.map(item => {
        const videoFileName = item.fileName.replace(/\.docx$/, ''); // Remove the .docx extension
        return {
            videoFileName: videoFileName,
            videoScript: item.script
        };
    });
}

// Function to prompt the user for a Yes or No response
async function yesOrNo(question) {
    console.log('')
    try {
        const answers = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmation',
                message: chalk.bold.yellow(question),
                default: false // Set default value as needed
            }
        ]);

        const confirmation = answers.confirmation;
        if (!confirmation) {
            logger.user_message('Job aborted')
            await delay(1000)
            process.exit(1)
        } else {
            logger.user_message('Job is ok to proceed')
            await delay(500)
            return
        }
    } catch (error) {
        console.log(error)
        process.exit(1)
    }
}

// This function creates the payload to send to Synthesia
async function generateSynthesiaPayload(videoFileName, videoScript, testVideo) {
    const data = {
        test: testVideo,
        visibility: 'private',
        title: videoFileName,
        input: [
            {
                avatarSettings: {
                    horizontalAlign: 'center',
                    scale: 1,
                    style: 'rectangular',
                    seamless: false,
                    voice: '3243108c-9337-48b0-b288-4f7ca9f2bec1'
                },
                backgroundSettings: {
                    videoSettings: {
                        shortBackgroundContentMatchMode: 'freeze',
                        longBackgroundContentMatchMode: 'trim'
                    }
                },
                avatar: 'fb4aeeb6-b8e2-424e-9631-3900ded817f7', // '49dc8f46-8c08-45f1-8608-57069c173827',
                background: 'workspace-media.a0f2bc02-b51f-4d88-8ea6-c42dedc078f1',
                scriptText: videoScript
            }
        ]
    };

    if (data.test) {
        logger.app_says(`Video is a test and will be watermarked`)
    } else {
        logger.warn(`Video is NOT a test.`)
    }
    logger.app_says(`Avatar ID is ${data.input[0].avatar}`)
    logger.app_says(`Background is ${data.input[0].background}`)
    return data
}

// This function checks for .DS_Store file and deletes it
async function deleteDSStoreFile(directory) {
    const dsStoreFilePath = path.join(directory, '.DS_Store');

    try {
        if (fs.existsSync(dsStoreFilePath)) {
            await fs.promises.unlink(dsStoreFilePath);
            logger.warn('.DS_Store file found and deleted')
            await delay(500)
        } else {
            logger.app_says('.DS_Store file not found')
        }
    } catch (error) {
        logger.warn(`Error deleting .DS_Store file: ${error.message}`)
        console.error;
    }
}

// This function sends the payload to Synthesia to create the video.
async function sendPayloadToSynthesia(videoData) {
    try {
        const response = await axios.post(apiURL, videoData, {
            headers: {
                accept: 'app_sayslication/json',
                'content-type': 'app_sayslication/json',
                Authorization: apiKey
            }
        });
        return response.data;
    } catch (error) {
        logger.synthesia_response(`Something wasn't right in the payload`, error.response.data.context)
        console.log(error.response.data)
        await delay((300))
        // console.error('Error creating video:', error);
        process.exit(1)
        throw error
    }
}

// This function gets the status of the video
async function getVideoStatus(videoId) {
    try {
        const response = await axios.get(`${apiURL}/${videoId}`, {
            headers: {
                accept: 'app_sayslication/json',
                Authorization: apiKey
            }
        });
        return response.data;
    } catch (error) {
        logger.synthesia_response(`Error in getting the video status`)
        await delay(200)
        logger.synthesia_response(error.response.data.context)
        await delay(1000)
        process.exit(1)
    }
}

// This function exists the script after a delay
function exitAfterDelay(delay) {
    setTimeout(async () => {
        process.exit(1);
    }, delay);
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
    logger.app_says(`${filename} downloaded.`)
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


const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function processScripts() {
    const testVideo = await isTestVideo()
    // We've got all the video data we need.
    const videoData = await getVideoData();
    console.clear('')
    if (testVideo) {

        console.log(chalk.bgGreen('               TEST RUN               '))
        console.log('')
        logger.app_says('Job flagged as a test run')
    } else {

        console.log(chalk.white.bgRed(`               LIVE RUN              `))
        console.log('')
        logger.warn('JOB IS FLAGGED AS A LIVE RUN')
    }
    await yesOrNo(`Ready to process scripts with Synthesia?`)
    // Loops through the files in scripts
    for (let i = 0; i < videoData.length; i++) {
        await deleteDSStoreFile('scripts')
        const videoFileName = videoData[i].videoFileName
        const videoScript = videoData[i].videoScript
        logger.app_says(`Title added to payload is ${videoFileName}`)
        await delay(500)
        logger.app_says('Script added to payload')
        await delay(500)
        logger.app_says(`Test video status added to payload`)
        await delay(500)
        // Send the video payload
        const data = await generateSynthesiaPayload(videoFileName, videoScript, testVideo)
        logger.app_says('Sending payload to Synthesia.')
        await delay(500)
        const synthesiaResponse = await sendPayloadToSynthesia(data)
        logger.synthesia_response(`createdAt: ${synthesiaResponse.createdAt}`)
        logger.synthesia_response(`id: ${synthesiaResponse.id}`)
        logger.synthesia_response(`status: ${synthesiaResponse.status}`)
        logger.synthesia_response(`title: ${synthesiaResponse.title}`)
        logger.synthesia_response(`visibility: ${synthesiaResponse.visibility}`)

        // Now we need keep checking the status of the video

        let video;
        while (true) {
            video = await getVideoStatus(synthesiaResponse.id)
            logger.synthesia_response(`Synthesia says video is ${video.status}`)
            if (video.status === 'complete') {
                logger.synthesia_response(`Synthesia says that the video is complete.`)
                logger.synthesia_response(`Download link is ${video.download}`)
                const fileExtension = path.extname(new URL(video.download).pathname);
                const filename = `${videoFileName}${fileExtension}`;
                logger.app_says(`Video filename set as ${filename}`)

                // Download the video
                await downloadVideo(video.download, filename)
                break;
            }
            await delay(120000); // wait for 120 seconds before checking again.
            logger.app_says('Asking Synthesia for an update.')
        }
    }
}

// This function deletes the video using it's UUID
async function deleteVideo(videoUUID) {
    logger.user_message(`Delete video ${videoUUID}`)
    const url = `https://api.synthesia.io/v2/videos/${videoUUID}`;

    // Set up the request headers
    const headers = {
        'accept': 'app_sayslication/json',
        'Authorization': apiKey
    };

    // Send DELETE request
    axios.delete(url, { headers })
        .then(response => {
            logger.synthesia_response(`Video ${videoUUID} is deleted.`)
        })
        .catch(error => {
            if (error.response) {
                // The request was made and the server responded with a status code
                logger.synthesia_response(`Error response code ${error.response.status}`)
                logger.synthesia_response(`Error message is ${error.response.statusText}`)
            } else if (error.request) {
                // The request was made but no response was received
                logger.error('Error request:', error.request);
            } else {
                // Something happ_saysened in setting up the request that triggered an Error
                logger.error('Error message:', error.message);
            }
        });
}


// This function deletes the video using it's UUID
async function updateVideo(videoUUID, newTitleOfVideo) {
    logger.user_message(`Update title of video ${videoUUID} to "${newTitleOfVideo}"`);
 

    const options = {
        method: 'PATCH',
        url: `https://api.synthesia.io/v2/videos/${videoUUID}`,
        headers: {
          accept: 'app_sayslication/json',
          'content-type': 'app_sayslication/json',
          Authorization: apiKey
        },
        data: {title: newTitleOfVideo}
      };
      
      axios
        .request(options)
        .then(function (response) {
            logger.synthesia_response(`Code ${response.status} - new title is "${newTitleOfVideo}"`)
        })
        .catch(function (error) {
          logger.error(error);
        });
}

async function listVideos(uuid) {
    logger.user_message(`Request video list from Synthesia`)
    try {
        const response = await axios.get(`https://api.synthesia.io/v2/videos?limit=${uuid}&offset=0`, {
            headers: {
                accept: 'app_sayslication/json',
                'content-type': 'app_sayslication/json',
                Authorization: apiKey
            }
        });
        const videoListAndIds = response.data.videos.map((video, index) => ({
            index: index + 1,
            title: video.title,
            id: video.id,
            duration: video.duration
        }));


        videoListAndIds.forEach(entry => {
            logger.synthesia_response(`${entry.index}> ${entry.id} - ${entry.index}> "${entry.title}" (${entry.duration})`)
        })

        return videoListAndIds

    } catch (error) {
        logger.synthesia_response(`Something wasn't right in the request`)
        console.log(error.response.data)
        await delay((300))
        // console.error('Error creating video:', error);
        process.exit(1)
        throw error
    }
}


async function videoList(uuid) {
    try {
        const response = await axios.get(`https://api.synthesia.io/v2/videos?limit=${uuid}&offset=0`, {
            headers: {
                accept: 'app_sayslication/json',
                'content-type': 'app_sayslication/json',
                Authorization: apiKey
            }
        });
        const videoListAndIds = response.data.videos.map((video, index) => ({
            index: index + 1,
            title: video.title,
            id: video.id,
            duration: video.duration
        }));

        return videoListAndIds

    } catch (error) {
        logger.synthesia_response(`Something wasn't right in the request`)
        console.log(error.response.data)
        await delay((300))
        // console.error('Error creating video:', error);
        process.exit(1)
        throw error
    }
}


switch (instruction) {
    case "/r":
        if (!uuid) {
            logger.error('Need video index to send delete request')
            await delay(3000)
            process.exit(1)
        } else {
            const videoListData = await videoList(100)
            console.log(chalk.white.bgRed(`               DELETE REQUEST              `))
            console.log('')
            logger.warn(`Delete request for ${videoListData[uuid - 1].id} - "${videoListData[uuid - 1].title}"`)
            await yesOrNo('Are you sure?')
            deleteVideo(videoListData[uuid - 1].id)
        }
        break;
    case "/l":
        if (!uuid) {
            uuid = 20
        }
        await listVideos(uuid)
        break;
    case "/s":
        if (!uuid) {
            logger.error('Need video index to get a video status')
            await delay(3000)
            process.exit(1)
        } else {
            const videoListData = await videoList(100)

            logger.user_message(`Get status of ${videoListData[uuid - 1].id} from Synthesia`)
            const videoapp_says = await getVideoStatus(videoListData[uuid - 1].id)
            logger.synthesia_response(`Video Title: ${videoapp_says.title}`)
            await delay(500)
            logger.synthesia_response(`Status is ${videoapp_says.status}`)
        }
        break;
    case "/dl":
        if (!uuid) {
            logger.error('Video index is missing')
            await delay(3000)
            process.exit(1)
        } else {
            const videoListData = await videoList(100)
            const videoapp_says = await getVideoStatus(videoListData[uuid - 1].id)
            logger.user_message(`Download ${videoListData[uuid - 1].id} from Synthesia`)
            await delay(350)
            logger.app_says(`Requesting video data of ${videoListData[uuid - 1].id} from Synthesia`)
            await delay(350)
            logger.synthesia_response(`Video Title: ${videoapp_says.title}`)
            await delay(500)
            if (videoapp_says.status != "complete") {
                logger.error(`Video status is ${videoapp_says.status} - can't download the video yet.`)
                await delay(1000)
                process.exit(1)
            } else {
                logger.synthesia_response(`Status is ${videoapp_says.status}`)
                logger.synthesia_response(`Download URL: ${videoapp_says.download}`)
                logger.synthesia_response(`ID: ${videoapp_says.id}`)
                try {
                    let downloadedVideoFileName = videoapp_says.title.replace(/\s+/g, '');
                    await downloadVideo(videoapp_says.download, `${downloadedVideoFileName}.mp4`)
                } catch (error) {
                    logger.warn(`Filename invalid - using UUID instead`)
                    await downloadVideo(videoapp_says.download, `${videoListData[uuid - 1].id}.mp4`)
                }


            }
        }
        break;
    case "/u":
        if (!newTitle) {
            logger.error(`The new title is missing`)
            await delay(1000)
            process.exit(1)
        } else {
            const videoListData = await videoList(100)
            const videoapp_says = await getVideoStatus(videoListData[uuid - 1].id)
            logger.user_message(`Update ${videoListData[uuid - 1].id}`)
            logger.app_says(`Requesting video data of ${videoListData[uuid - 1].id} from Synthesia`)
            logger.synthesia_response(`Video Title: ${videoapp_says.title}`)
            await updateVideo(videoListData[uuid - 1].id, newTitle)
        }
        break;
    case "/a":
        if (!uuid) {
            logger.error(`API key is missing.`)
            await delay(1000)
            process.exit(1)
        } else {
            addApiKeyToEnvFile(uuid)
        }

    break;
    default:
        processScripts()
        break;
}



