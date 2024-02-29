import { FugleTrade, Order } from "@fugle/trade";
import { DiscordBot } from "./bot";
import { HistoryFetcher } from "./history";
import { SmaCrossStrategyWrapper } from "./trading_strategy/strategy_wrapper";
import { TradingIntention } from "./trading_strategy/types";
import { Stock } from "@fugle/trade/lib/interfaces";
import { ApCode } from "@fugle/trade/lib/enums";

const { 
    DiscordBotToken, 
    DiscordChannelId, 
    TradeApiConfigPath, 
    EsunPass, 
    CertPass, 
    MarketApiKey, 
    TargetSymbols,
    PersistBalance } = require('./config.json');

const isTradeDate = async () => {
    const fugleClient = new FugleTrade({ 
        configPath : TradeApiConfigPath,
        config: {
            certPass : CertPass,
            password : EsunPass
        } });
    await fugleClient.login();
    const marketStatus = await fugleClient.getMarketStatus();
    await fugleClient.logout();
    return marketStatus.isTradingDay;
};

const formatDate = (date : Date) => {
    return date
        .toLocaleDateString('en-CA', { timeZone: "Asia/Taipei"}); // yyyy-mm-dd
}

const waitUntilCrossDay = async () => {
    const utcNow = new Date();
    const date = formatDate(utcNow).split('-');
    
    const utcNextDay = new Date(
        parseInt(date[0]),
        parseInt(date[1]) - 1,
        parseInt(date[2]) + 1,
        -8, 0, 0, 0);
    await new Promise((resolve, reject) => setTimeout(resolve, utcNextDay.getTime() - utcNow.getTime()));
}

const isTimeBeforeMarketOpen = () => {
    const utcNow = new Date();
    const date = formatDate(utcNow).split('-');
    const utcBeforeMarketOpen = new Date(
        parseInt(date[0]),
        parseInt(date[1]) - 1,
        parseInt(date[2]),
        0, 0, 0, 0);
    
    return utcNow <  utcBeforeMarketOpen;
}

const waitUntilNextMarketOpen = async () => {
    const utcNow = new Date();
    const date = formatDate(utcNow).split('-');
    const utcMarketOpen = new Date(
        parseInt(date[0]),
        parseInt(date[1]) - 1,
        parseInt(date[2]),
        1, 0, 0, 0);
    if (utcNow > utcMarketOpen)
        throw new Error("Excuted after market open!");
    await new Promise((resolve, reject) => setTimeout(resolve, utcMarketOpen.getTime() - utcNow.getTime()));
}

const isBeforeCloseTime = () => {
    const utcNow = new Date();
    const date = formatDate(utcNow).split('-');
    const utcMarketClose = new Date(
        parseInt(date[0]),
        parseInt(date[1]) - 1,
        parseInt(date[2]),
        5, 0, 0, 0);
    return utcNow < utcMarketClose;
}

const calculateSignals = async () => {
    const current = new Date();
    const todayDate = formatDate(current);

    const historyFetcher = new HistoryFetcher(MarketApiKey);
    const toDate = todayDate;
    const fromDate = formatDate(new Date(
        current.getFullYear(),
        current.getMonth() - 11,
        current.getDate(),
        current.getHours(), 
        current.getMinutes(),
        current.getSeconds(),
        current.getMilliseconds()));
    
    const buySignals = [] as { symbol : string, price : number }[];
    const sellSignals = [] as { symbol : string, price : number }[];
    
    for(let symbol of TargetSymbols) {
        const ohlcv = await historyFetcher.fetch(symbol, [ { from: fromDate, to: toDate } ]);
        const strategyWrapper = new SmaCrossStrategyWrapper(ohlcv);
        
        const intention = strategyWrapper.calculateIntention();
        switch (intention.tradingIntention) {
            case TradingIntention.Buy:
                buySignals.push({ symbol: symbol, price: intention.price });
                break;
            case TradingIntention.Sell:
                sellSignals.push({ symbol: symbol, price: intention.price });
                break;
            default:
                break;
        }
    }

    return {buySignals, sellSignals};
}

const calculateOrders = async (input : { buySignals : { symbol : string, price : number }[], sellSignals :{ symbol : string, price : number }[] }) => {
    const { buySignals, sellSignals } = input;
    const fugleClient = new FugleTrade({ 
        configPath : TradeApiConfigPath,
        config: {
            certPass : CertPass,
            password : EsunPass
        } });
    await fugleClient.login();

    const balance = await fugleClient.getBalance();
    const tradeStatus = await fugleClient.getTradeStatus();
    const inventory = await fugleClient.getInventories();
    const settlementSum = await fugleClient.getSettlements()
        .then(settlements => settlements.reduce((sum, settlement) => sum += parseInt(settlement.price), 0));
    
    let availableBalance = Math.min(balance.availableBalance as number + settlementSum - PersistBalance, tradeStatus.tradeLimit as number);
    const buyOrders = buySignals.reduce((prev, cur) => {
        if (availableBalance > cur.price * 1000) {
            const qty = Math.floor(availableBalance / (cur.price * 1000));
            const order = new Order({
                buySell: Order.Side.Buy,
                price: cur.price,
                stockNo: cur.symbol,
                quantity: qty,
                apCode: Order.ApCode.Common,
                priceFlag: Order.PriceFlag.Limit,
                bsFlag: Order.BsFlag.ROD,
                trade: Order.Trade.Cash,
            });
            availableBalance -= qty * cur.price * 1000;
            return prev.concat([order]);
        }
        else if (availableBalance / cur.price > 50) {
            const qty = Math.floor(availableBalance / cur.price);
            const order = new Order({
                buySell: Order.Side.Buy,
                price: cur.price,
                stockNo: cur.symbol,
                quantity: qty,
                apCode: Order.ApCode.IntradayOdd,
                priceFlag: Order.PriceFlag.Limit,
                bsFlag: Order.BsFlag.ROD,
                trade: Order.Trade.Cash,
            });
            availableBalance -= qty * cur.price;
            return prev.concat([order]);
        }
        return prev;
    }, [] as Order[]);
    const sellOrders = sellSignals.reduce((prev, cur) => {
        const stockOpt = inventory.find(stock => stock.stkNo === cur.symbol);
        if (stockOpt == undefined)
            return prev;
        const stock = stockOpt as Stock;
        const ownedTotalShare = stock.stkDats.reduce((s, d) => s += parseInt(d.qty), 0);
        const ownedLot = Math.floor(ownedTotalShare / 1000);
        const ownedRemainedShare = ownedTotalShare - ownedLot * 1000;

        let ret = prev;
        if (ownedLot > 0)
        {
            const order = new Order({
                buySell: Order.Side.Sell,
                price: cur.price,
                stockNo: cur.symbol,
                quantity: ownedLot,
                apCode: Order.ApCode.Common,
                priceFlag: Order.PriceFlag.Limit,
                bsFlag: Order.BsFlag.ROD,
                trade: Order.Trade.Cash,
            });
            ret = ret.concat([order]);
        }
        if (ownedRemainedShare > 0)
        {
            const order = new Order({
                buySell: Order.Side.Sell,
                price: cur.price,
                stockNo: cur.symbol,
                quantity: ownedRemainedShare,
                apCode: Order.ApCode.IntradayOdd,
                priceFlag: Order.PriceFlag.Limit,
                bsFlag: Order.BsFlag.ROD,
                trade: Order.Trade.Cash,
            });
            ret = ret.concat([order]);
        }
        return ret;
    }, [] as Order[]);
    
    await fugleClient.logout();
    return { buyOrders, sellOrders };
}

const placeOrders = async (input : { buyOrders : Order[], sellOrders: Order[] }) => {
    const { buyOrders, sellOrders } = input;
    const fugleClient = new FugleTrade({ 
        configPath : TradeApiConfigPath,
        config: {
            certPass : CertPass,
            password : EsunPass
        } });
    await fugleClient.login();
    const orders = buyOrders.concat(sellOrders);
    for(let order of orders) {
        await fugleClient.placeOrder(order);
    }
    await fugleClient.logout();
}

const main = async () => {
    const bot = await DiscordBot.Create(DiscordBotToken, DiscordChannelId);
    
    while(true) {
        try {
            const current = new Date();
            const todayDate = formatDate(current);

            // 1. Wait next day to calculate strategy
            if (!isTimeBeforeMarketOpen()) {
                await waitUntilCrossDay();
                continue;
            }
            
            // 2. Calculate strategy only on trading day
            const isInTradeDate = await isTradeDate();
            if (!isInTradeDate) {
                await bot.send(`[${todayDate}]\n今日休市 (´・ω・｀)`);
                await waitUntilCrossDay();
                continue;
            }
            
            // 3. Calculate targets' buy and sell signals
            const { buySignals, sellSignals } = await calculateSignals();

            if (buySignals.length === 0 && sellSignals.length === 0) {
                await bot.send(`[${todayDate}]\n今日無交易訊號 (-_-)zzz`);
                await waitUntilCrossDay();
                continue;
            }
            else {
                await bot.send(`[${todayDate}]\n` +
                '購買訊號：\n' +
                (buySignals.length === 0 ?
                    '- 無\n' :
                    `${buySignals.reduce((prev, cur) => prev += `- Symbol: ${cur.symbol} | Price: ${cur.price}\n`, "")}`) +
                '賣出訊號：\n' +
                (sellSignals.length === 0 ?
                    '- 無\n' :
                    `${sellSignals.reduce((prev, cur) => prev += `- Symbol: ${cur.symbol} | Price: ${cur.price}\n`, "")}`));
            }
            

            // 4. Calculate orders
            const { buyOrders, sellOrders } = await calculateOrders({ buySignals, sellSignals });
            
            if (buyOrders.length === 0 && sellOrders.length === 0) {
                await bot.send(`[${todayDate}]\n本日無預計買賣單 ('ω')ノ`);
                await waitUntilCrossDay();
                continue;
            }
            else {
                await bot.send(`[${todayDate}]\n` +
                    '預計買單：\n' +
                    (buyOrders.length === 0 ? 
                        '- 無\n' :
                        `${buyOrders.reduce((prev, cur) => prev += `- Symbol: ${cur.payload.stockNo} | Price: ${cur.payload.price} | Quantity: ${cur.payload.quantity} | ${cur.payload.apCode === ApCode.Common ? '整股' : '零股'}\n`, "")}`) +
                    '預計賣單：\n' +
                    (sellOrders.length === 0 ?
                        '- 無\n' :
                        `${sellOrders.reduce((prev, cur) => prev += `- Symbol: ${cur.payload.stockNo} | Price: ${cur.payload.price} | Quantity: ${cur.payload.quantity} | ${cur.payload.apCode === ApCode.Common ? '整股' : '零股'}\n`, "")}`));
            }

            // 5. Wait market open
            await waitUntilNextMarketOpen();
            
            // 6. Place orders
            await placeOrders({ buyOrders, sellOrders });
            await bot.send(`[${todayDate}]\n已下完單 ( ｀ー´)ノ\n`);

            await waitUntilCrossDay();
        }
        catch(err){
            console.log(err);
            await bot.send((err as Error).message);
        }
    }
}

main();