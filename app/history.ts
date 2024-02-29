import { RestClient } from '@fugle/marketdata';
import axios from 'axios';
import fs from 'fs';

type ohlcv = {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    turnover: number;
    change: number;
}

export interface IHistoryFetcher {
    fetch(symbol : string) : Promise<ohlcv[]>
}

export class HistoryFetcher implements IHistoryFetcher {
    private readonly _periods = [
        { from: '2019-01-01', to: '2019-12-31'},
        { from: '2020-01-01', to: '2020-12-31'},
        { from: '2021-01-01', to: '2021-12-31'},
        { from: '2022-01-01', to: '2022-12-31'},
        { from: '2023-01-01', to: '2023-12-31'},
    ];
    private readonly _dataPathRoot = 'data/history/';
    private readonly _cooldownTime = 1200;

    private readonly _marketClient : RestClient;

    public constructor(marketKey : string) {
        this._marketClient = new RestClient({ apiKey: marketKey });
    }

    public async fetch(
        symbol: string, 
        forceUsePeriods: { from: string, to: string }[] = this._periods) : Promise<ohlcv[]> {
        
        return forceUsePeriods === this._periods && fs.existsSync(this._getDataPath(symbol)) ?
            this._fetchFromLocal(symbol) :
            await this._fetchFromFugo(symbol, forceUsePeriods, forceUsePeriods === this._periods);
    }

    private _fetchFromLocal(symbol : string) : ohlcv[]{
        return this._loadJson(this._getDataPath(symbol));
    }

    private async _fetchFromFugo(symbol : string, periods : { from: string, to: string }[], save : boolean = false) : Promise<ohlcv[]>{
        let result = [] as Array<ohlcv>;

        for (const period of periods) {
            console.log(`Fetching '${symbol}' start, period [${period.from},${period.to}]`);
            const data = await this._marketClient.stock.historical
                .candles({ symbol: symbol, from: period.from, to: period.to })
                .then(resp => resp.data);
            
            if (data !== undefined)
                result = result.concat(data.map(d => {
                    return {
                        date : d.date,
                        open: d.open,
                        high: d.high,
                        low: d.low,
                        close: d.close,
                        volume: d.volume,
                        turnover: d.turnover,
                        change: d.change,
                        rank: Number.NaN
                    }
                }));
            await new Promise(r => setTimeout(r, this._cooldownTime));
        }

        result = result.sort((a, b) => a.date < b.date ? -1 : 1);

        if (save) {
            this._saveJson(JSON.stringify(result), this._getDataPath(symbol));
        }

        return result;
    } 

    private _getDataPath(symbol : string) {
        return `${this._dataPathRoot}${symbol}.json`;
    }

    private _saveJson(data : string, path: string) {
        if (!fs.existsSync(this._dataPathRoot))
            fs.mkdirSync(this._dataPathRoot, { recursive : true });
        fs.writeFileSync(
            path, 
            data);
    }
    
    private _loadJson(path: string) : ohlcv[] {
        let raw = fs.readFileSync(path, 'utf8');
        return JSON.parse(raw);
    }
}

type daterankrecord = { date : string, rank : number }

export interface IForeignCapitalRankFetcher {
    fetchAll() : Promise<Map<string, daterankrecord[]>>;
}

export class TWSCForeignCapitalRankFetcher implements IForeignCapitalRankFetcher {
    private readonly _url = 'https://www.twse.com.tw/pcversion/zh/fund/TWT38U';
    private readonly _dataPathRoot = 'data/TWT38U/';
    private readonly _fileName = 'ForeignCapitalRank.json';
    private readonly _from = new Date('2019-01-01');
    private readonly _to = new Date('2023-12-31');
    private readonly _saveRank = 100;

    public async fetchAll() : Promise<Map<string, daterankrecord[]>> {
        return fs.existsSync(this._getDataPath()) ?
            this._fetchFromLocal() :
            await this._fetchFromTwse();
    }

    private async _fetchFromTwse() : Promise<Map<string, daterankrecord[]>> {
        let result = new Map<string, daterankrecord[]>();
        let target = this._from;
        while (target <= this._to) {
            const formatDate = this._formatDate(target);
            const payload = `response=json&date=${formatDate}`;
            console.log(`Fetching foreign capital rank '${formatDate}' start`);
            const raw = await axios.post(
                this._url,
                payload)
                .then(resp => resp.data['data']);
            if (raw !== undefined) {
                const castData = raw as Array<Array<string>>;
                castData
                    .filter((_, index) => index < this._saveRank)
                    .forEach((data, index) => {
                        const symbol = data[1].trim();
                        if (!result.has(symbol))
                            result.set(symbol, [] as daterankrecord[]);
                        result.get(symbol)?.push({ date : target.toISOString().split('T')[0], rank : index });
                    });
            }
            target.setDate(target.getDate() + 1);
        }

        this._saveJson(JSON.stringify(Object.fromEntries(result)), this._getDataPath());

        return result;
    }

    private _fetchFromLocal() : Map<string, daterankrecord[]> {
        return new Map<string, daterankrecord[]>(Object.entries(this._loadJson(this._getDataPath())));
    }

    private _formatDate(date : Date) : string {
        var y = date.getFullYear();
        var m = ('00' + (date.getMonth()+1)).slice(-2);
        var d = ('00' + date.getDate()).slice(-2);
        return (y + m + d);
    }

    private _getDataPath() {
        return `${this._dataPathRoot}${this._fileName}`;
    }

    private _saveJson(data : string, path: string) {
        if (!fs.existsSync(this._dataPathRoot))
            fs.mkdirSync(this._dataPathRoot, { recursive : true });
        fs.writeFileSync(
            path, 
            data);
    }
    
    private _loadJson(path: string) {
        let raw = fs.readFileSync(path, 'utf8');
        return JSON.parse(raw);
    }
}

type symbolrecord = { symbol : string, name : string }

export interface ISymbolFetcher {
    fetch() : Promise<symbolrecord[]>;
}

export class AllSymbolFetcher implements ISymbolFetcher {
    private readonly _url = 'https://stock.wespai.com/pick/choice';
    private readonly _dataPathRoot = 'data/symbols/';
    private readonly _fileName = 'symbols.json';

    public async fetch() : Promise<symbolrecord[]> {
        return fs.existsSync(this._getDataPath()) ?
            this._fetchFromLocal() :
            await this._fetchFromRemote();
    }

    private async _fetchFromRemote() : Promise<symbolrecord[]> {
        console.log(`Fetching all symbols start`);
        const payload = `qry%5B%5D=dv&id%5B%5D=dv&val%5B%5D=0%3B12000`;
        let result = [] as symbolrecord[];
        const raw = await axios.post(
            this._url,
            payload)
            .then(resp => resp.data);
        
        if (raw !== undefined) {
            const castData = (raw as [string, string, string][]).map(r => ({ symbol: r[0], name: r[1] })) as symbolrecord[];
            result = castData;
        }

        this._saveJson(JSON.stringify(result), this._getDataPath());

        return result;
    }

    private _fetchFromLocal() : symbolrecord[] {
        return this._loadJson(this._getDataPath());
    }

    private _getDataPath() {
        return `${this._dataPathRoot}${this._fileName}`;
    }

    private _saveJson(data : string, path: string) {
        if (!fs.existsSync(this._dataPathRoot))
            fs.mkdirSync(this._dataPathRoot, { recursive : true });
        fs.writeFileSync(
            path, 
            data);
    }
    
    private _loadJson(path: string) {
        let raw = fs.readFileSync(path, 'utf8');
        return JSON.parse(raw);
    }
}