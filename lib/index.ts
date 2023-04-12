import mysql, { Connection, ConnectionOptions, ResultSetHeader } from 'mysql2';
import { Store, SessionData } from 'express-session';

export class MySQLSessionStore extends Store {
    private config: ConnectionOptions;
    private tableName: string;
    private state: 'INITIALIZING' | 'INITIALIZED' | "FAIL";
    private onReadyPromises: Array<(value?: unknown) => void>;

    constructor(config: ConnectionOptions, tableName: string = 'sessions') {
        super();
        this.config = config;
        this.tableName = tableName;

        this.state = 'INITIALIZING';
        this.onReadyPromises = [];

        Promise.resolve()
            .then(() => {
                return this.createTableIfNotExists();
            })
            .then(() => {
                this.state = 'INITIALIZED';
                this.resolveReadyPromises();
            })
            .catch((error) => {
                this.state = "FAIL";
                this.rejectReadyPromises(error);
            });
    }

    onReady(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.state === 'INITIALIZED') {
                resolve();
            } else if (this.state === 'FAIL') {
                reject();
            } else {
                this.onReadyPromises.push(resolve);
            }
        });
    }

    private resolveReadyPromises(): void {
        for (const resolve of this.onReadyPromises) {
            resolve();
        }
        this.onReadyPromises = [];
    }

    private rejectReadyPromises(error: any): void {
        for (const resolve of this.onReadyPromises) {
            resolve(error);
        }
        this.onReadyPromises = [];
    }

    private queryAsync(query: string): Promise<any[] | ResultSetHeader> {
        return new Promise(async (resolve, reject) => {
            let connection = await this.getConnection();
            connection.query(query, (err, results) => {
                connection.end();

                if (err) {
                    reject(err);
                } else {
                    resolve(results as any[]);
                }
            });
        });
    };

    private async getConnection(): Promise<Connection> {
        return new Promise((resolve, reject) => {
            const connection = mysql.createConnection(this.config);
            connection.connect((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(connection);
                }
            });
        });
    }

    async isTableCreated(): Promise<boolean> {
        const results = await this.queryAsync("SHOW TABLES") as any[];

        const tableNames = results.map(row => Object.values(row)[0]);

        return tableNames.includes(this.tableName);
    }

    async waitUntilTableExists(timeout: number = 6000): Promise<void> {

        const startTime = Date.now();
        const endTime = startTime + timeout;

        while (Date.now() < endTime) {
            try {
                if ( await this.isTableCreated() ) {
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (e) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        throw new Error(`Timed out waiting for table ${this.tableName} to exist`);
    }

    public createTableIfNotExists(): Promise<void> {
        return new Promise((resolve, reject) => {

            Promise.resolve()
                .then(async () => {
                    const createTableQuery = `
                        CREATE TABLE IF NOT EXISTS ${this.tableName} (
                            id VARCHAR(255) PRIMARY KEY,
                            session JSON NOT NULL,
                            expires TIMESTAMP(6) NOT NULL,
                            INDEX expires_idx (expires)
                        );    
                    `;

                    try {
                        let result = await this.queryAsync(createTableQuery) as ResultSetHeader;
                        
                        if (result.warningStatus == 0) {
                            await this.waitUntilTableExists();
                        }
                    } catch (err) {
                        console.error(`Failed to create ${this.tableName} table:`, err);
                        throw err;
                    }

                    resolve();
                })
                .catch((err) => {
                    console.error(`Failed to create ${this.tableName} table:`, err);

                    reject(err);
                });
        });
    }

    async get(sessionId: string, callback: (err: any, session?: SessionData | null) => void): Promise<void> {
        try {
            await this.onReady();
            const connection = await this.getConnection();
            const query = `SELECT session FROM ${this.tableName} WHERE id = ? AND expires >= CURRENT_TIMESTAMP(6)`;

            connection.query(query, [sessionId], (err, results: any[]) => {
                connection.end();

                if (err) {
                    throw err;
                } else if (results.length === 0) {
                    callback(null, null);
                } else {
                    const sessionData = results[0].session;
                    callback(null, sessionData);
                }
            });
        } catch (err) {
            callback(err);
        }

    }

    async set(sessionId: string, session: SessionData, callback?: (err?: any) => void): Promise<void> {
        try {
            await this.onReady();

            const connection = await this.getConnection();
            const expires = session.cookie.expires
                ? session.cookie.expires.toISOString().slice(0, -1)
                : new Date(Date.now() + session.cookie.maxAge).toISOString().slice(0, -1);
            const query = `
                    INSERT INTO ${this.tableName} (id, session, expires)
                    VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE session = ?, expires = ?;
                    `;

            connection.query(query, [sessionId, JSON.stringify(session), expires, JSON.stringify(session), expires], (err) => {
                connection.end();

                if (callback) {
                    callback(err);
                }
            });
        } catch (err) {
            if (callback) {
                callback(err);
            }
        }

    }

    async touch(sessionId: string, session: SessionData, callback?: (err?: any) => void): Promise<void> {
        try {
            await this.onReady();

            const connection = await this.getConnection();
            const expires = session.cookie.expires
                ? session.cookie.expires.toISOString().slice(0, -1)
                : new Date(Date.now() + session.cookie.maxAge).toISOString().slice(0, -1);
            const query = `
                UPDATE ${this.tableName}
                SET expires = ?
                WHERE id = ? AND expires >= CURRENT_TIMESTAMP(6);
            `;

            connection.query(query, [expires, sessionId], (err) => {
                connection.end();

                if (callback) {
                    callback(err);
                }
            });
        } catch (err) {
            if (callback) {
                callback(err);
            }
        }
    }

    async destroy(sessionId: string, callback?: (err?: any) => void): Promise<void> {
        try {
            await this.onReady();

            const connection = await this.getConnection();
            const query = `DELETE FROM ${this.tableName} WHERE id = ?`;

            connection.query(query, [sessionId], (err) => {
                connection.end();

                if (callback) {
                    callback(err);
                }
            });
        } catch (err) {
            if (callback) {
                callback(err);
            }
        }
    }


    async length(callback: (err: any, length?: number | null) => void): Promise<void> {
        try {
            await this.onReady();

            const connection = await this.getConnection();
            const query = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE expires >= CURRENT_TIMESTAMP(6)`;

            connection.query(query, (err, results) => {
                connection.end();

                if (err) {
                    callback(err);
                } else {
                    callback(null, results[0].count);
                }
            });
        } catch (err) {
            callback(err);
        }
    }

    async clear(callback?: (err?: any) => void): Promise<void> {
        try {
            await this.onReady();

            const connection = await this.getConnection();
            const query = `DELETE FROM ${this.tableName}`;

            connection.query(query, (err) => {
                connection.end();

                if (callback) {
                    callback(err);
                }
            });
        } catch (err) {
            if (callback) {
                callback(err);
            }
        }
    }

    async reap(): Promise<void> {
        try {
            await this.onReady();

            const connection = await this.getConnection();
            const query = `DELETE FROM ${this.tableName} WHERE expires < CURRENT_TIMESTAMP(6)`;

            connection.query(query, (err) => {
                connection.end();

                if (err) {
                    console.error('Failed to clean up expired sessions:', err);
                } else {
                    console.log('Expired sessions cleaned up');
                }
            });
        } catch (err) {
            console.error(err);
        }
    }
}