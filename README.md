# HomeToGo Daily Posts Scraper

This project is a Node.js server built with Express for daily scraping of posts from [HomeToGo](https://www.hometogo.de/). The server is designed to automate the process of collecting data from the website and processing it efficiently.

## Features

- Daily scraping of posts from HomeToGo.
- Task scheduling for automated scraping.
- Lightweight and easy-to-configure Express server.

## Requirements

Ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v14 or higher recommended)
- [npm](https://www.npmjs.com/) (comes with Node.js)

## Installation

1. Clone the repository:

   ```bash
   git clone <repository_url>
   cd <repository_folder>
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory and configure it with the necessary environment variables:
   ```env
   CRON_SCHEDULE=0 0 * * *  # Example: Run daily at midnight
   TIMEZONE=Europe/Berlin   # Set the timezone
   ```

## Usage

### Starting the server

To start the server in development mode:

```bash
npm run dev
```

To start the server in production mode:

```bash
npm start
```

### Available Scripts

- `npm run dev` - Starts the server with `nodemon` for development.
- `npm start` - Starts the server in production mode.

## File Structure

- `src/`
  - Main application logic.
- `.env`
  - Environment variables (not included in the repository, configure your own).

## License

This project is licensed under the MIT License. Feel free to use and modify it as needed.
