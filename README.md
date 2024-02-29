# Introduction 
This is a sample project using Fugle and Discord bot to make your own service from backtest to trade.

# How to use

### 1. Setting develop environment
For development, use `start_docker.sh` to help you to create container and enter shell:
```
./start_docker.sh
```
```
npm run backtest // For running backtest
npm run trade // For runnung trade
```

For deployment, you should build docker image and this image will run `npm run trade` on start:
```
docker build -t {your_tag} -f Dockerfile.prod .
```

### 2. Edit config.json
Copy `app/config.json.example` to `app/config.json` and follow [Fugle](https://developer.fugle.tw/docs/trading/prerequisites) and [Discord bot](https://discord.com/developers/docs/getting-started) instructions to fill in fields.
```
{
    "DiscordBotToken" : "",
    "DiscordChannelId" : "",
    "TradeApiConfigPath" : "something.ini",
    "EsunPass" : "Login to Esun Password",
    "CertPass" : "Trade Certification Password",
    "MarketApiKey" : "Fugle market api key",
    "TargetSymbols" : [
        "2330", "2454", "2317", "2308", "2303"
    ],
    "PersistBalance" : 0
}
```

### 3. Backtest
#### i. Define target symbols
Edit target symbols in `app/config.json`
#### ii. Design strategy
You can follow `app/strategy/SmaCrossStrategy.ts` to design custom strategy extends `Strategy` from `@fugle/backtest`.  
After then, replace the [strategy](https://github.com/chiaohao/SimpleStockBot/blob/main/app/backtest.ts#L28) in `app/backtest.ts` and run `npm run backtest`.  

### 4. Trade
Once you determined your strategy, wrap your strategy by extending `IStrategyWrapper`, you can follow `app/trading_strategy/strategy_wrapper.ts`.  
After then, replace the [strategy wrapper](https://github.com/chiaohao/SimpleStockBot/blob/main/app/trade.ts#L105) in `app/trade.ts` and run `npm run trade`.  

