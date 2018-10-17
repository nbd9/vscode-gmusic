'use strict';
import { window, commands, Disposable, ExtensionContext, StatusBarAlignment, StatusBarItem } from 'vscode';
import * as WebSocket from 'ws';

export function activate(context: ExtensionContext) {
    let gMusic = new gMusicClass(context);

    let playpauseCommand = commands.registerCommand('gmusic.playpause', () => {
        gMusic.togglePlay();
    });
    let shuffleCommand = commands.registerCommand('gmusic.shuffle', () => {
        gMusic.toggleShuffle();
    });
    let skipCommand = commands.registerCommand('gmusic.skip', () => {
        gMusic.forward();
    });
    let rewindCommand = commands.registerCommand('gmusic.rewind', () => {
        gMusic.rewind();
    });
    let likeCommand = commands.registerCommand('gmusic.setThumbs', () => {
        window.showQuickPick(['Thumbs Up', 'Thumbs Down', 'Remove Rating'])
            .then(val => {
                switch (val) {
                    case 'Thumbs Up':
                        gMusic.setThumbs(true, false);
                        break;
                    case 'Thumbs Down':
                        gMusic.setThumbs(false, true);
                        break;
                    case 'Remove Rating':
                        gMusic.setThumbs(false, false);
                        break;
                }
            });
        })
    let restartCommand = commands.registerCommand('gmusic.restart', () => {
        gMusic.dispose();
        gMusic = new gMusicClass(context);
    })

    context.subscriptions.push(playpauseCommand);
    context.subscriptions.push(shuffleCommand);
    context.subscriptions.push(skipCommand);
    context.subscriptions.push(rewindCommand);
    context.subscriptions.push(likeCommand);
    context.subscriptions.push(gMusic);
}

interface track {
    title: string;
    artist: string;
    album: string;
    albumArt: string;
}

interface gMusicResponse {
    channel: string;
    payload: any;
}

interface rating {
    liked: boolean;
    disliked: boolean;
}

/**
 * Constantly changing class that holds GPMDP data
 *
 * @export
 * @class gMusicData
 */
export class gMusicClass {
    private _statusBarItem: StatusBarItem;

    private _playState: boolean;
    private _track: track;
    private _rating: rating;
    private _shuffle: string;
    private _repeat: string;
    private _onChange: any;
    private ws: any;

    constructor(context: ExtensionContext) {
        const Cache = require('vscode-cache');

        // Create as needed
        if (!this._statusBarItem) {
            this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
        }

        this.ws = new WebSocket('ws://localhost:5672');
        let codeCache = new Cache(context);

        // Being "polite" and asking GPMDP if we can have control.
        this.ws.on('open', () => {
            if (codeCache.has('authCode')) {
                this.ws.send(JSON.stringify({
                    namespace: 'connect',
                    method: 'connect',
                    arguments: ['vscode-gmusic', codeCache.get('authCode')]
                }))
            } else {
                this.ws.send(JSON.stringify({
                    namespace: 'connect',
                    method: 'connect',
                    arguments: ['vscode-gmusic']
                }))
            }
        })

        // Receiving data from GPMDP.
        this.ws.on('message', (data) => {
            let gMusicResponse: gMusicResponse = JSON.parse(data);
            switch (gMusicResponse.channel) {
                case 'connect':
                    if (gMusicResponse.payload === 'CODE_REQUIRED') {
                        window.showInputBox({ prompt: 'Please input the number shown on GPMDP' }).then(code => {
                            this.ws.send(JSON.stringify({
                                namespace: 'connect',
                                method: 'connect',
                                arguments: ['vscode-gmusic', code]
                                }))
                            })
                        } else {
                            codeCache.put('authCode', gMusicResponse.payload)
                    }
                    break;
                case 'playState':
                    this._playState = gMusicResponse.payload;
                    break;
                case 'track':
                    this._track = gMusicResponse.payload;
                    this.refreshStatusBar();
                    break;
                case 'rating':
                    this._rating = gMusicResponse.payload;
                    break;
                case 'shuffle':
                    this._shuffle = gMusicResponse.payload;
                    break;
                case 'repeat':
                    this._repeat = gMusicResponse.payload;
                    break;
            }
        });

        this.ws.on('error', (err) => this.dispose);
    }

    public refreshStatusBar() {
        let textItem = this._track ? '$(triangle-right) ' + this._track.title + ' - ' + this._track.artist : '$(primitive-square)'
        this._statusBarItem.text = textItem
        this._statusBarItem.show();
    }

    public togglePlay() {
        this.ws.send(JSON.stringify({
            namespace: 'playback',
            method: 'playPause',
            arguments: null
        }))
    }

    public forward() {
        this.ws.send(JSON.stringify({
            namespace: 'playback',
            method: 'forward',
            arguments: null
        }))
    }

    public rewind() {
        this.ws.send(JSON.stringify({
            namespace: 'playback',
            method: 'rewind',
            arguments: null
        }))
    }

    public toggleShuffle() {
        this.ws.send(JSON.stringify({
            namespace: 'playback',
            method: 'toggleShuffle',
            arguments: null
        }))
    }

    public toggleRepeat(mode: string) {
        this.ws.send(JSON.stringify({
            namespace: 'playback',
            method: 'setRepeat',
            arguments: mode
        }))
    }

    public setThumbs(thumbsUp: boolean, thumbsDown: boolean) {
        let numberRating = 0;
        if (thumbsUp) {
            numberRating = 5;
        } else if (thumbsDown) {
            numberRating = 1
        } else {
            this.ws.send(JSON.stringify({
                namespace: 'rating',
                method: 'resetRating',
                arguments: null
            }))
            return
        }
        this.ws.send(JSON.stringify({
            namespace: 'rating',
            method: 'setRating',
            arguments: numberRating
        }))
    }

    public dispose() {
        this._statusBarItem.dispose();
    }
}