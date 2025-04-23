#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const archiver = require('archiver');
const FormData = require('form-data');
const { program } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:8080';
const BUILDER_URL = process.env.BUILDER_URL || 'http://localhost:8082';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'dev-token';

// Helper functions
const log = {
  info: (msg) => console.log(chalk.blue('INFO: ') + msg),
  success: (msg) => console.log(chalk.green('SUCCESS: ') + msg),
  error: (msg) => console.error(chalk.red('ERROR: ') + msg),
  warn: (msg) => console.warn(chalk.yellow('WARNING: ') + msg)
};

// Create a zip file of the current directory
async function createZipArchive(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    output.on('close', () => {
      log.info(`Archive created: ${outputPath} (${archive.pointer()} bytes)`);
      resolve(outputPath);
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    // Add files to the archive
    archive.glob('**/*', {
      cwd: sourceDir,
      ignore: ['node_modules/**', '.git/**', '*.zip']
    });

    archive.finalize();
  });
}

// Initialize a new function project
async function initFunction(options) {
  const runtimes = ['python-flask', 'nodejs', 'go'];
  
  // If runtime not specified, prompt user
  if (!options.runtime) {
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'runtime',
        message: 'Select a runtime:',
        choices: runtimes
      }
    ]);
    options.runtime = answers.runtime;
  }
  
  // Validate runtime
  if (!runtimes.includes(options.runtime)) {
    log.error(`Invalid runtime: ${options.runtime}`);
    log.info(`Available runtimes: ${runtimes.join(', ')}`);
    process.exit(1);
  }
  
  // Create function directory if it doesn't exist
  const functionDir = options.name || 'my-function';
  if (!fs.existsSync(functionDir)) {
    fs.mkdirSync(functionDir);
  }
  
  // Create function files based on runtime
  switch (options.runtime) {
    case 'python-flask':
      fs.writeFileSync(path.join(functionDir, 'requirements.txt'), 'flask==2.0.1\nwerkzeug==2.0.1\n');
      fs.writeFileSync(path.join(functionDir, 'app.py'), `
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/', methods=['GET', 'POST'])
def hello():
    return jsonify({
        "message": "Hello from Serverless Platform!",
        "method": request.method
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
`);
      break;
    case 'nodejs':
      fs.writeFileSync(path.join(functionDir, 'package.json'), `{
  "name": "${functionDir}",
  "version": "1.0.0",
  "description": "Serverless function",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "express": "^4.17.1"
  }
}
`);
      fs.writeFileSync(path.join(functionDir, 'index.js'), `
const express = require('express');
const app = express();
const port = 8080;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    message: 'Hello from Serverless Platform!',
    method: req.method
  });
});

app.post('/', (req, res) => {
  res.json({
    message: 'Hello from Serverless Platform!',
    method: req.method,
    body: req.body
  });
});

app.listen(port, () => {
  console.log(\`Function listening at http://localhost:\${port}\`);
});
`);
      break;
    case 'go':
      fs.writeFileSync(path.join(functionDir, 'go.mod'), `module function

go 1.16
`);
      fs.writeFileSync(path.join(functionDir, 'main.go'), `
package main

import (
	"encoding/json"
	"log"
	"net/http"
)

type Response struct {
	Message string \`json:"message"\`
	Method  string \`json:"method"\`
}

func handler(w http.ResponseWriter, r *http.Request) {
	response := Response{
		Message: "Hello from Serverless Platform!",
		Method:  r.Method,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func main() {
	http.HandleFunc("/", handler)
	log.Println("Function listening at http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
`);
      break;
  }
  
  // Create function.json config file
  fs.writeFileSync(path.join(functionDir, 'function.json'), JSON.stringify({
    name: functionDir,
    runtime: options.runtime,
    version: '0.1.0'
  }, null, 2));
  
  log.success(`Function initialized in ${functionDir}/`);
  log.info(`Runtime: ${options.runtime}`);
  log.info('To deploy your function, run:');
  log.info(`  cd ${functionDir} && plat deploy`);
}

// Deploy a function
async function deployFunction(options) {
  try {
    // Check if function.json exists
    const configPath = path.join(process.cwd(), 'function.json');
    if (!fs.existsSync(configPath)) {
      log.error('function.json not found. Run this command from a function directory.');
      process.exit(1);
    }
    
    // Read function config
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const functionName = options.name || config.name;
    
    log.info(`Deploying function: ${functionName}`);
    
    // Create zip archive
    const zipPath = path.join(process.cwd(), `${functionName}.zip`);
    await createZipArchive(process.cwd(), zipPath);
    
    // Upload to builder service
    const formData = new FormData();
    formData.append('file', fs.createReadStream(zipPath));
    formData.append('name', functionName);
    
    log.info('Building function...');
    const buildResponse = await axios.post(`${BUILDER_URL}/build`, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    
    // Register function with API Gateway
    log.info('Registering function...');
    const registerResponse = await axios.post(`${API_URL}/register`, {
      name: functionName,
      endpoint: `http://function-controller:8081`
    }, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });
    
    // Register function with Function Controller
    log.info('Registering function with controller...');
    const controllerResponse = await axios.post(`http://localhost:8081/register`, {
      name: functionName,
      image: buildResponse.data.image,
      port: 0  // Let the controller assign a port
    });
    
    // Clean up zip file
    fs.unlinkSync(zipPath);
    
    log.success(`Function ${functionName} deployed successfully`);
    log.info(`Invoke URL: ${API_URL}/function/${functionName}`);
    log.info(`Authorization: Bearer ${AUTH_TOKEN}`);
  } catch (error) {
    log.error('Deployment failed:');
    if (error.response) {
      log.error(`${error.response.status}: ${JSON.stringify(error.response.data)}`);
    } else {
      log.error(error.message);
    }
    process.exit(1);
  }
}

// List functions
async function listFunctions() {
  try {
    const response = await axios.get(`${API_URL}/list`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });
    
    const functions = response.data;
    
    if (Object.keys(functions).length === 0) {
      log.info('No functions deployed');
      return;
    }
    
    console.log(chalk.bold('\nDeployed Functions:'));
    console.log(chalk.bold('------------------'));
    
    for (const [name, func] of Object.entries(functions)) {
      console.log(chalk.bold(`\n${name}`));
      console.log(`Endpoint: ${API_URL}/function/${name}`);
    }
  } catch (error) {
    log.error('Failed to list functions:');
    if (error.response) {
      log.error(`${error.response.status}: ${JSON.stringify(error.response.data)}`);
    } else {
      log.error(error.message);
    }
    process.exit(1);
  }
}

// Invoke a function
async function invokeFunction(functionName, options) {
  try {
    const method = options.method || 'GET';
    const data = options.data ? JSON.parse(options.data) : {};
    
    log.info(`Invoking function: ${functionName} (${method})`);
    
    const response = await axios({
      method,
      url: `${API_URL}/function/${functionName}`,
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      data: method !== 'GET' ? data : undefined
    });
    
    console.log(chalk.bold('\nResponse:'));
    console.log(chalk.bold('------------------'));
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    log.error('Invocation failed:');
    if (error.response) {
      log.error(`${error.response.status}: ${JSON.stringify(error.response.data)}`);
    } else {
      log.error(error.message);
    }
    process.exit(1);
  }
}

// Main CLI program
program
  .name('plat')
  .description('Serverless Platform CLI')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize a new function')
  .option('-n, --name <name>', 'Function name')
  .option('-r, --runtime <runtime>', 'Runtime (python-flask, nodejs, go)')
  .action(initFunction);

program
  .command('deploy')
  .description('Deploy a function')
  .option('-n, --name <name>', 'Override function name from function.json')
  .action(deployFunction);

program
  .command('list')
  .description('List deployed functions')
  .action(listFunctions);

program
  .command('invoke <function-name>')
  .description('Invoke a function')
  .option('-m, --method <method>', 'HTTP method (GET, POST, PUT, DELETE)', 'GET')
  .option('-d, --data <json>', 'JSON data to send with the request')
  .action(invokeFunction);

program.parse(process.argv);
