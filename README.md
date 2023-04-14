# MySQLSessionStore

A custom session store for Express.js using MySQL as the backend storage. It is based on the implementation described in [this blog post](https://tobelinuxer.tistory.com/66).

## Table of Contents

1. [Introduction](#introduction)
2. [Installation](#installation)
3. [Usage](#usage)
4. [API](#api)
5. [Contributing](#contributing)


## Introduction

MySQLSessionStore is a custom session store for Express.js applications, which uses MySQL as the backend storage for session data. This library provides a simple and efficient way to manage session data in a scalable and distributed environment. The primary motivation behind creating this custom session store was to facilitate its use in serverless environments like AWS Lambda, where managing MySQL connections and ensuring proper cleanup after each query is crucial. In addition, the library takes care of creating the required table during the initialization phase, which can be problematic in serverless environments. Thus, MySQLSessionStore was designed to address these specific challenges.

## Installation

Install the package using npm:

```bash
npm install serverless-mysql-session-store
```

## Usage

To use MySQLSessionStore in your Express.js application, follow these steps:

1. Import the required modules:

```typescript
const express = require('express');
const session = require('express-session');
const { MySQLSessionStore } = require('serverless-dynamodb-session-store');
```

2. Configure the MySQL connection and create an instance of **'MySQLSessionStore'**:

```typescript
const mysqlConfig = {
  host: 'localhost',
  user: 'username',
  password: 'password',
  database: 'your_database'
};

const store = new MySQLSessionStore(mysqlConfig);
```

3. Configure the express-session middleware to use your custom store:

```typescript
app.use(session({
  secret: 'your_secret',
  resave: false,
  saveUninitialized: true,
  store: store
}));
```

## API

The MySQLSessionStore class extends the express-session.Store class and implements the following methods:

- get(sessionId: string, callback: (err: any, session: SessionData | null) => void): Promise<void>
- set(sessionId: string, session: SessionData, callback?: (err?: any) => void): Promise<void>
- destroy(sessionId: string, callback?: (err?: any) => void): Promise<void>
- length(callback: (err: any, length?: number) => void): Promise<void>
- touch(sessionId: string, session: SessionData, callback?: (err?: any) => void): Promise<void>
- reap(callback?: (err?: any) => void): Promise<void>
- all(callback: (err: any, sessions?: { [sid: string]: SessionData } | null) => void): Promise<void>

## Contributing

Contributions and feedback are welcome. Happy coding!
