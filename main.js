const electron = require('electron');
const url = require('url');
const path = require('path');
const bittrex = require('node-bittrex-api');
const rp = require('request-promise');

const currencyOptions = {
	method: 'POST',
	uri: 'https://www.koreaexim.go.kr/site/program/financial/exchangeJSON/',
	qs: {
		authkey: '3MX72UclemPB219PmyNJINc8NR2oBGX3',
		data: 'AP01'
	},
	json: true
};
const coinoneTicker = {
	uri: 'https://api.coinone.co.kr/ticker/',
	qs: {
		currency: 'all'
	},
	json: true 
}
const coinoneOrderBook = {
	uri: 'https://api.coinone.co.kr/orderbook/',
	qs: {
		currency: 'xrp'
	},
	json: true
}

let exchangeRate = 1100.0; //default 1100
let btc_usd = 1.0;
let btc_xrp = 1.0;
let xrp = 1.0;
let btc = 1.0;

const {app, BrowserWindow, Menu, ipcMain} = electron;

let mainWindow;
let addWindow;

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

	rp(currencyOptions)
		.then((result) => {
			result.forEach((info) => {
				if(info.cur_unit == 'USD') {
					exchangeRate = parseFloat(info.kftc_bkpr.replace(/,/g, ""));
					mainWindow.webContents.send('send:exchangeRate', exchangeRate);
					console.log('exchange rate: ', exchangeRate);
					bittrexWebsocket();
				} 
			});
		})
		.catch((error) => {
			console.log('error:getExchangeRate', error);
		})
});

function bittrexWebsocket() {
	bittrex.websockets.listen(function(data, client) {
		if (data.M === 'updateSummaryState') {
			console.log("----");
			rp(coinoneTicker)
				.then((result) => {
					console.log("coinone hitted!");
					xrp = parseFloat(result.xrp.last);
					btc = parseFloat(result.btc.last);
					console.log('coinone xrp : ', xrp);
					console.log('coinone btc : ', btc);
				})
				.catch((err) => {
					console.log("코인원 ticker 에러 발생");
				});
			rp(coinoneOrderBook)
				.then((result) => {
					console.log("orderbook : ", result.ask[0].price);
				})
				.catch((err) => {
					console.log("orderbook error", err);
				});
			data.A.forEach(function(data_for) {
				data_for.Deltas.forEach(function(marketsDelta) {
					// console.log('Ticker Update for ' + marketsDelta.MarketName, marketsDelta);
					if(marketsDelta.MarketName === 'BTC-XRP') {
						// console.log('Ticker Update for ' + marketsDelta.MarketName, marketsDelta);
						btc_xrp = parseFloat(marketsDelta.Last);
						console.log('bittrex BTC_XRP: ', btc_xrp);
						// console.log('bittrex XRT KRW type: ', typeof marketsDelta.Last);
						mainWindow.webContents.send('send:price', marketsDelta);
					}
					if(marketsDelta.MarketName === 'USDT-BTC'){
						btc_usd = parseFloat(marketsDelta.Last);
						console.log('bittrex BTC USD: ', btc_usd);
					}
				});
			});
			console.log("bittrex BTC KRW: ", btc_usd * btc_xrp * exchangeRate);
		}
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