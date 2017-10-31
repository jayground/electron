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

let btc_xrp;
let xrp_bittrex;
let xrp;
let btc;
let diff;
let profit_per_1btc;
let mainWindow;
let addWindow;

let coinone_encoded_payload;
let coinone_signature;
let bittres_signature;

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

	rp(coinoneTicker)
		.then((coinone_result) => {
			xrp = coinone_result.xrp.last; //typeof result.xrp.last = string
			// mainWindow.webContents.send('send:xrp', coinone_result.xrp.last);
			btc = coinone_result.btc.last;
			// mainWindow.webContents.send('send:btc', coinone_result.btc.last);
			console.log('initial price of xrp : ', xrp);
			console.log('initial price of btc : ', btc);
			return rp(bittrexTicker)
		})
		.then((bittrex_result) => {
			btc_xrp = bittrex_result.result.Ask; // Purchase price
			mainWindow.webContents.send('send:btc_xrp', btc_xrp);
			mainWindow.webContents.send('send:xrp', xrp);
			mainWindow.webContents.send('send:btc', btc);
			console.log('initial rate of BTC_XRP : ', btc_xrp);
			// bittrexWebsocket();
			// coinoneWebsocket();
			// coinoneWebsocket2();
		})
		.catch((err) => {
			console.log("initial load had an error", err);
		});
});

function bittrexWebsocket() {
	bittrex.websockets.listen(function(data, client) {
		if (data.M === 'updateSummaryState') {
			data.A.forEach(function(data_for) {
				data_for.Deltas.forEach(function(marketsDelta) {
					if(marketsDelta.MarketName === 'BTC-XRP') {
						console.log('bittrex', marketsDelta.Ask)
						btc_xrp = marketsDelta.Ask
						let btc_num = parseFloat(btc);
						let btc_xrp_num = parseFloat(btc_xrp);
						let xrp_num = parseFloat(xrp);
						// let xrp_bittrex_num = parseFloat(xrp_bittrex);

						xrp_bittrex = (btc_num * btc_xrp_num).toFixed(2).toString();
						diff = (xrp_num - parseFloat(xrp_bittrex)).toFixed(2);
						console.log('bittrex!');
						console.log('xrp : ', xrp_num);
						console.log('xrp_bittrex : ', xrp_bittrex);
						console.log('diff : ', diff);
						profit_per_1btc = ((1 / btc_xrp_num) * diff).toFixed(0);

						mainWindow.webContents.send('send:btc_xrp', btc_xrp);
						mainWindow.webContents.send('send:xrp_bittrex', xrp_bittrex);
						mainWindow.webContents.send('send:diff', diff.toString());
						mainWindow.webContents.send('send:profit_per_1btc', profit_per_1btc.toString());
					}
				});
			});
		}
	});
}

function coinoneWebsocket() {
	const socket = io.connect('https://push.coinone.co.kr/orderbook', {transports:['websocket','polling']});

	socket.on('connect', function() {
		console.log("connected!");
		return socket.emit('subscribe', 'BTC', 5000)
	});

	socket.on('clear_market_bid_ask', () => {
		console.log('clear market bid ask');
	})

	socket.on('update', (data) => {
		if (btc != JSON.parse(data.ASK)[0].price) {
			btc = JSON.parse(data.ASK)[0].price;
			let btc_num = parseFloat(btc);
			let btc_xrp_num = parseFloat(btc_xrp);
			let xrp_num = parseFloat(xrp);
			// let xrp_bittrex_num = parseFloat(xrp_bittrex);

			xrp_bittrex = (btc_num * btc_xrp_num).toFixed(2).toString();
			diff = (xrp_num - parseFloat(xrp_bittrex)).toFixed(2);
			console.log('coinone btc');
			console.log('xrp : ', xrp_num);
			console.log('xrp_bittres : ', xrp_bittrex);
			console.log('diff : ', diff);
			profit_per_1btc = ((1 / btc_xrp_num) * diff).toFixed(0);
			
			mainWindow.webContents.send('send:xrp_bittrex', xrp_bittrex);
			mainWindow.webContents.send('send:diff', diff.toString());
			mainWindow.webContents.send('send:profit_per_1btc', profit_per_1btc.toString());
			mainWindow.webContents.send('send:btc', btc);
		}
		console.log('coinone btc : ', JSON.parse(data.BID)[0].price);
		// console.log('ask : ', JSON.parse(data.BID)[0].qty);
	})

	socket.on('error', function(err) {
		console.log("error: ", err);
	});
}

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
			let btc_xrp_num = parseFloat(btc_xrp);
			let xrp_num = parseFloat(xrp);
			let xrp_bittrex_num = parseFloat(xrp_bittrex);

			diff = (xrp_num - xrp_bittrex_num).toFixed(2);
			console.log('coinone xrp');
			console.log('xrp : ', xrp_num);
			console.log('xrp_bittres : ', xrp_bittrex_num);
			console.log('diff : ', diff);
			profit_per_1btc = ((1 / btc_xrp_num) * diff).toFixed(0);

			mainWindow.webContents.send('send:xrp', xrp);
			mainWindow.webContents.send('send:diff', diff.toString());
			mainWindow.webContents.send('send:profit_per_1btc', profit_per_1btc.toString());
		}
		// xrp = JSON.parse(data.BID)[0].price;
		// mainWindow.webContents.send('send:xrp', xrp);
		console.log('coinone xrp : ', JSON.parse(data.BID)[0].price);
		// console.log('ask : ', JSON.parse(data.BID)[0].qty);
	})

	socket.on('error', function(err) {
		console.log("error: ", err);
	});
}

function createAddWindow() {
	addWindow = new BrowserWindow({
		width: 300,
		height: 200,
		title: "Add item"
	});

	addWindow.loadURL(url.format({
		pathname: path.join(__dirname, "addWindow.html"),
		protocol: 'file',
		slashes: true
	}));

	addWindow.on('close', function(){
		addWindow = null;
	});
}





// Power clicked, Statue : On
const bit_getbalance_url = 'https://bittrex.com/api/v1.1/account/getbalance';
let bit_xrp_balance;
let bit_btc_balance;

const coin_getbalance_url = 'https://api.coinone.co.kr/v2/account/balance/';
const coin_getaddress_url = 'https://api.coinone.co.kr/v2/account/deposit_address/';
let coin_xrp_balance;
let coin_btc_balance;

const secretInfo = getPrivateInfo(); 

ipcMain.on('power:on', function(e) {
	const payload = {
		'access_token': secretInfo.coinone_token,
		'nonce': Date.now()
	}
	const url_query_xrp = bit_getbalance_url + `?apikey=${secretInfo.bittrex_apikey}&nonce=${Date.now()}&currency=${'XRP'}`;
	const url_query_btc = bit_getbalance_url + `?apikey=${secretInfo.bittrex_apikey}&nonce=${Date.now()}&currency=${'BTC'}`;
	
	const coin_balance_op = get_response(payload, coin_getbalance_url, secretInfo.coinone_apisecret);
	const coin_address_op = get_response(payload, coin_getaddress_url, secretInfo.coinone_apisecret);
	const bit_xrp_op = get_response_bit(url_query_xrp, secretInfo.bittrex_apisecret);
	const bit_btc_op = get_response_bit(url_query_btc, secretInfo.bittrex_apisecret);

	rp(coin_balance_op)
		.then((result) => {
			console.log(result);
			coin_xrp_balance = result.xrp.balance;
			coin_btc_balance = result.btc.balance;
			mainWindow.webContents.send('coinone:xrp_balance', coin_xrp_balance);
			mainWindow.webContents.send('coinone:btc_balance', coin_btc_balance);
		})
		.catch((err) => {
			console.error(err);
		})

	rp(coin_address_op)
		.then((result) => {
			console.log(result);
			// mainWindow.webContents.send('coinone:xrp_address', result.walletAddress.xrp);
		})
		.catch((err) => {
			console.error(err);
		})

	rp(bit_xrp_op)
		.then((result) => {
			console.log(result.result.Balance);
			bit_xrp_balance = result.result.Balance;
			mainWindow.webContents.send('bittrex:xrp_balance', bit_xrp_balance);
		})
		.catch((err) => {
			console.error(err);
		})

	rp(bit_btc_op)
		.then((result) => {
			console.log(result);
			bit_btc_balance = result.result.Balance;
			mainWindow.webContents.send('bittrex:btc_balance', bit_btc_balance);
		})
		.catch((err) => {
			console.error(err);
		})
});

ipcMain.on('item:add', function(e, item){
	mainWindow.webContents.send('item:add', item);
	addWindow.close();
});


const mainMenuTemplate = [
	{
		label: 'File',
		submenu: [
			{
				label: "Add Item",
				click(){
					createAddWindow();
				}
			},
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
	// rp(options)
	// 	.then((result) => {
	// 		console.log(result);
	// 	})
	// 	.catch((error) => {
	// 		console.error(error);
	// 	});
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
	// rp(options)
	// 	.then((result) => {
	// 		console.log(result);
	// 	})
	// 	.catch((error) => {
	// 		console.error(error);
	// 	});
}

// read JSON file and get secret information
function getPrivateInfo() {
	return JSON.parse(fs.readFileSync('information.json'));
}