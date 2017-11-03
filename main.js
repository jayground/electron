// 3rd party module
const electron = require('electron');
const {app, BrowserWindow, Menu, ipcMain} = electron;
const CryptoJS = require('crypto-js');
const bittrex = require('node-bittrex-api');
const rp = require('request-promise');
const io = require('socket.io-client');

// node integrated module
const fs = require('fs');
const url = require('url');
const path = require('path');

const bit_getbalance_url = 'https://bittrex.com/api/v1.1/account/getbalance';
const bit_getaddress_url = 'https://bittrex.com/api/v1.1/account/getdepositaddress';
const coin_getbalance_url = 'https://api.coinone.co.kr/v2/account/balance/';
const coin_getaddress_url = 'https://api.coinone.co.kr/v2/account/deposit_address/';
const secretInfo = getPrivateInfo(); 

let btc_xrp;
let xrp_bittrex;
let xrp;
let btc;
let diff;
let profit_per_1btc;
let mainWindow;
let bit_xrp_balance;
let bit_xrp_available;
let bit_btc_balance;
let bit_btc_available;
let coin_xrp_balance;
let coin_xrp_available;
let coin_btc_balance;
let coin_btc_available;
let coin_krw_balance;
let coin_krw_available;

app.on('ready', function() {
	mainWindow = new BrowserWindow({});
	mainWindow.loadURL(url.format({
		pathname: path.join(__dirname, "mainWindow.html"),
		protocol: 'file',
		slashes: true
	}));

	mainWindow.on('closed', function(){
		app.quit();
	})

	const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);

	Menu.setApplicationMenu(mainMenu);
});

// action : power on
ipcMain.on('power:on', function(e) {
	const payload = {
		'access_token': secretInfo.coinone_token,
		'nonce': Date.now()
	}
	const url_query_xrp = bit_getbalance_url + `?apikey=${secretInfo.bittrex_apikey}&nonce=${Date.now()}&currency=${'XRP'}`;
	const url_query_btc = bit_getbalance_url + `?apikey=${secretInfo.bittrex_apikey}&nonce=${Date.now()}&currency=${'BTC'}`;
	const coin_balance_op = get_response(payload, coin_getbalance_url, secretInfo.coinone_apisecret);
	const bit_xrp_balance_op = get_response_bit(url_query_xrp, secretInfo.bittrex_apisecret);
	const bit_btc_balance_op = get_response_bit(url_query_btc, secretInfo.bittrex_apisecret);
	const coinoneTicker = {
		uri: 'https://api.coinone.co.kr/ticker/',
		qs: {
			currency: 'all'
		},
		json: true 
	}
	const bittrexTicker = {
		uri: 'https://bittrex.com/api/v1.1/public/getticker/',
		qs: {
			market: 'BTC-XRP'
		},
		json: true
	}
	
	setInterval(function() {
		// get coinone all coin balance
		rp(coin_balance_op)
			.then((result) => {
				console.log(result);
				coin_xrp_balance = result.xrp.balance;
				coin_xrp_available = result.xrp.avail;
				coin_btc_balance = result.btc.balance;
				coin_btc_available = result.btc.avail;
				coin_krw_balance = result.krw.balance;
				coin_krw_available = result.krw.avail;
				mainWindow.webContents.send('coinone:xrp_balance', coin_xrp_balance);
				mainWindow.webContents.send('coinone:xrp_available', coin_xrp_available);
				mainWindow.webContents.send('coinone:btc_balance', coin_btc_balance);
				mainWindow.webContents.send('coinone:btc_available', coin_btc_available);
				mainWindow.webContents.send('coinone:krw_balance', coin_krw_balance);
				mainWindow.webContents.send('coinone:krw_available', coin_krw_available);
			})
			.catch((err) => {
				console.error(err);
			})

		// get bittrex xrp balance
		rp(bit_xrp_balance_op)
			.then((result) => {
				console.log(result);
				bit_xrp_balance = result.result.Balance;
				bit_xrp_available = result.result.Available;
				mainWindow.webContents.send('bittrex:xrp_balance', bit_xrp_balance);
				mainWindow.webContents.send('bittrex:xrp_available', bit_xrp_available);
			})
			.catch((err) => {
				console.error(err);
			})

		// get bittrex btc balance
		rp(bit_btc_balance_op)
			.then((result) => {
				console.log(result);
				bit_btc_balance = result.result.Balance;
				bit_btc_available = result.result.Available;
				mainWindow.webContents.send('bittrex:btc_balance', bit_btc_balance);
				mainWindow.webContents.send('bittrex:btc_available', bit_btc_available);
			})
			.catch((err) => {
				console.error(err);
			})
		}, 60000)
	// get initial value
	rp(coinoneTicker)
		.then((coinone_result) => {
			xrp = coinone_result.xrp.last;
			btc = coinone_result.btc.last;
			return rp(bittrexTicker)
		})
		.then((bittrex_result) => {
			btc_xrp = bittrex_result.result.Bid; //매수가격
			mainWindow.webContents.send('send:btc_xrp', btc_xrp);
			mainWindow.webContents.send('send:xrp', xrp);
			mainWindow.webContents.send('send:btc', btc);
			bittrexWebsocket();
			coinoneWebsocket();
			coinoneWebsocket2();
		})
		.catch((err) => {
			console.error("initial load had an error", err);
		});

	mainWindow.webContents.send('coinone:xrp_tag', secretInfo.coinone_xrp_tag);
	mainWindow.webContents.send('coinone:xrp_address', secretInfo.coinone_xrp_address);
	// mainWindow.webContents.send('bittrex:xrp_tag', secretInfo.bittrex_xrp_tag);
	mainWindow.webContents.send('bittrex:btc_address', secretInfo.bittrex_btc_address);
});

// coinone private API call
function get_encoded_payload(payload) {
	const words = CryptoJS.enc.Utf8.parse(JSON.stringify(payload));
	return CryptoJS.enc.Base64.stringify(words);
}

function get_signature(encoded_payload, secret_key) {
	return CryptoJS.HmacSHA512(encoded_payload, secret_key.toUpperCase());
}

function get_response(payload, url, secret_key) {
	const encoded_payload = get_encoded_payload(payload);
	const options = {
		method: 'POST',
		uri: url,
		qs: payload,
		headers: {
			'X-COINONE-PAYLOAD': encoded_payload,
			'X-COINONE-SIGNATURE': get_signature(encoded_payload, secret_key)
		},
		json: true
	};
	return options
}

// bittrex private API call
function get_response_bit(url_query, secret_key) {
	
	const options = {
		uri: url_query,
		headers: {
			'apisign': CryptoJS.HmacSHA512(url_query, secret_key)
		},
		json: true
	};
	return options
}

// read JSON file and get secret information
function getPrivateInfo() {
	return JSON.parse(fs.readFileSync('information.json'));
}

// helper function to calculate bittrex xrp, difference, profit and send it
function caculateBTCXRP(btc, xrp, btc_xrp) {
	let btc_num = parseFloat(btc);
	let btc_xrp_num = parseFloat(btc_xrp);
	let xrp_num = parseFloat(xrp);

	let xrp_bittrex_num = (btc_num * btc_xrp_num);
	let diff_num = (xrp_num - xrp_bittrex_num);
	let profit_per_1btc = ((1 / btc_xrp_num) * diff_num).toFixed(0);

	mainWindow.webContents.send('send:xrp_bittrex', xrp_bittrex_num.toFixed(2).toString());
	mainWindow.webContents.send('send:diff', diff_num.toFixed(2).toString());
	mainWindow.webContents.send('send:profit_per_1btc', profit_per_1btc.toString());
}

// websocket connection to get BTC_XRP ask value from bittrex
function bittrexWebsocket() {
	bittrex.websockets.listen(function(data, client) {
		if (data.M === 'updateSummaryState') {
			data.A.forEach(function(data_for) {
				data_for.Deltas.forEach(function(marketsDelta) {
					if(marketsDelta.MarketName === 'BTC-XRP') {
						console.log('bittrex btc-xrp: ', marketsDelta.Ask)
						btc_xrp = marketsDelta.Ask //매수가격
						mainWindow.webContents.send('send:btc_xrp', btc_xrp);
						caculateBTCXRP(btc, xrp, btc_xrp);
					}
				});
			});
		}
	});
}

// websocket connection to get BTC ask value from coinone
function coinoneWebsocket() {
	const socket = io.connect('https://push.coinone.co.kr/orderbook', {transports:['websocket','polling']});

	socket.on('connect', function() {
		console.log("connected!");
		return socket.emit('subscribe', 'BTC', 5000)
	});

	socket.on('update', (data) => {
		if (btc != JSON.parse(data.ASK)[0].price) {
			btc = JSON.parse(data.ASK)[0].price;
			console.log('coinone btc: ', btc);
			mainWindow.webContents.send('send:btc', btc);
			caculateBTCXRP(btc, xrp, btc_xrp);
		}
	})

	socket.on('error', function(err) {
		console.error("error: ", err);
	});
}

// websocket connection to get BTC ask value from coinone
function coinoneWebsocket2() {
	const socket = io.connect('https://push.coinone.co.kr/orderbook', {transports:['websocket','polling']});

	socket.on('connect', function() {
		console.log("connected!");
		return socket.emit('subscribe', 'XRP', 1)
	});

	socket.on('clear_market_bid_ask', () => {
		console.log('clear market bid ask');
	})

	socket.on('update', (data) => {
		if (xrp != JSON.parse(data.BID)[0].price) {
			xrp = JSON.parse(data.BID)[0].price;
			console.log("coinone xrp: ", xrp);
			mainWindow.webContents.send('send:xrp', xrp);
			caculateBTCXRP(btc, xrp, btc_xrp);
		}
	})

	socket.on('error', function(err) {
		console.log("error: ", err);
	});
}

// electron menu and production and os settings
const mainMenuTemplate = [
	{
		label: 'File',
		submenu: [
			// {
			// 	label: "Add Item",
			// 	click(){
			// 		createAddWindow();
			// 	}
			// },
			{
				label: "Clear Items",
				click(){
					mainWindow.webContents.send('item:clear');
				}
			},
			{
				label: "Quit",
				accelerator: process.platform == 'darwin' ? 'Command+Q':'Ctrl+Q',
				click(){
					app.quit();
				}
			}
		]
	}
];

if(process.platform == 'darwin'){
	mainMenuTemplate.unshift({});
}

if(process.env.NODE_ENV !== 'production'){
	mainMenuTemplate.push({
		label: 'Developer Tools',
		submenu:[
			{
				label: 'Toggle DevTools',
				accelerator: process.platform == 'darwin' ? 'Command+I':'Ctrl+I',
				click(item, focusedWindow){
					focusedWindow.toggleDevTools();
				}
			},
			{
				role: 'reload'
			}
		]
	})
}

// ipcMain.on('item:add', function(e, item){
// 	mainWindow.webContents.send('item:add', item);
// 	addWindow.close();
// });

// function createAddWindow() {
// 	addWindow = new BrowserWindow({
// 		width: 300,
// 		height: 200,
// 		title: "Add item"
// 	});

// 	addWindow.loadURL(url.format({
// 		pathname: path.join(__dirname, "addWindow.html"),
// 		protocol: 'file',
// 		slashes: true
// 	}));

// 	addWindow.on('close', function(){
// 		addWindow = null;
// 	});
// }