```markdown
# Video Creation Script

This repository contains a script for creating and downloading videos using the Synthesia API. The script creates a video, checks its status every 3 seconds, and downloads it once it's complete, saving it with a specific filename, as passed through as an argument when the script is run.

## Prerequisites

- Node.js
- npm (Node Package Manager)
- Synthesia API key

## Setup

1. **Clone the repository**:
   ```sh
   git clone https://github.com/DangerMounce/video_creation.git
   cd video_creation
   ```

2. **Install dependencies**:
   ```sh
   npm install
   ```

3. **Create a `.env` file in the root directory and add your Synthesia API key**:
   ```env
   API_KEY=your_synthesia_api_key
   ```

4. **Ensure you have a `downloads` folder in the root directory or the script will create it automatically**.

## Usage

Run the script with the following command:

```sh
node script [filename]
```

## Script Overview

The script performs the following steps:

1. **Load environment variables**: Loads the API key from the `.env` file using the `dotenv` package.
2. **Generate Video Data**: Prepares the video data to be sent to the Synthesia API.
3. **Create Video**: Sends a request to the Synthesia API to create a video with the specified data.
4. **Check Video Status**: Polls the Synthesia API every 3 seconds to check if the video is complete.
5. **Download Video**: Once the video is complete, it downloads the video and saves it to the `downloads` folder with the filename `chris` and the appropriate file extension.

## Dependencies

- axios: ^0.21.1
- dotenv: ^10.0.0

## Contributing

If you want to contribute to this project, please fork the repository and create a pull request with your changes.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
```