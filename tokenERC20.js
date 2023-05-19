/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
*/

'use strict';

const { Contract } = require('fabric-contract-api');

// Define objectType names for prefix
const balancePrefix = 'balance';
// const allowancePrefix = 'allowance';

const transactionDataPrefix = 'transactionData'

// Define key names for options
const nameKey = 'name';
const symbolKey = 'symbol';
const decimalsKey = 'decimals';
const totalSupplyKey = 'totalSupply';

class TokenERC20Contract extends Contract {

    // 開戶
    async signup(ctx, userAddress) {
        
        //check contract options are already set first to execute the function
        await this.CheckInitialized(ctx);

        const userBalanceKey = ctx.stub.createCompositeKey(balancePrefix, [userAddress]);
        const userCurrentBalanceBytes = await ctx.stub.getState(userBalanceKey);

        let userCurrentBalance;
        // If recipient current balance doesn't yet exist, we'll create it with a current balance of 0
        if (!userCurrentBalanceBytes || userCurrentBalanceBytes.length === 0) {
            userCurrentBalance = 0;
        } else {
            userCurrentBalance = parseInt(userCurrentBalanceBytes.toString());
        }

        await ctx.stub.putState(userBalanceKey, Buffer.from(userCurrentBalance.toString()));

        console.log(`${userAddress} 註冊成功`);

        return true;
    }

    /**
     * Return the name of the token - e.g. "MyToken".
     * The original function name is `name` in ERC20 specification.
     * However, 'name' conflicts with a parameter `name` in `Contract` class.
     * As a work around, we use `TokenName` as an alternative function name.
     *
     * @param {Context} ctx the transaction context
     * @returns {String} Returns the name of the token
    */
    // 代幣的全名
    async TokenName(ctx) {

        //check contract options are already set first to execute the function
        await this.CheckInitialized(ctx);

        const nameBytes = await ctx.stub.getState(nameKey);

        return nameBytes.toString();
    }

    /**
     * Return the symbol of the token. E.g. “HIX”.
     *
     * @param {Context} ctx the transaction context
     * @returns {String} Returns the symbol of the token
    */
    // 代幣的縮寫
    async Symbol(ctx) {

        //check contract options are already set first to execute the function
        await this.CheckInitialized(ctx);

        const symbolBytes = await ctx.stub.getState(symbolKey);
        return symbolBytes.toString();
    }

    /**
     * Return the number of decimals the token uses
     * e.g. 8, means to divide the token amount by 100000000 to get its user representation.
     *
     * @param {Context} ctx the transaction context
     * @returns {Number} Returns the number of decimals
    */
    // 代幣的最小單位
    async Decimals(ctx) {

        //check contract options are already set first to execute the function
        await this.CheckInitialized(ctx);

        const decimalsBytes = await ctx.stub.getState(decimalsKey);
        const decimals = parseInt(decimalsBytes.toString());
        return decimals;
    }

    /**
     * Return the total token supply.
     *
     * @param {Context} ctx the transaction context
     * @returns {Number} Returns the total token supply
    */
    // 代幣的總量
    async TotalSupply(ctx) {

        //check contract options are already set first to execute the function
        await this.CheckInitialized(ctx);

        const totalSupplyBytes = await ctx.stub.getState(totalSupplyKey);
        const totalSupply = parseInt(totalSupplyBytes.toString());
        return totalSupply;
    }

    /**
     * BalanceOf returns the balance of the given account.
     *
     * @param {Context} ctx the transaction context
     * @param {String} owner The owner from which the balance will be retrieved
     * @returns {Number} Returns the account balance
     */
    // 查詢某帳戶的代幣餘額
    async BalanceOf(ctx, owner) {

        //check contract options are already set first to execute the function
        await this.CheckInitialized(ctx);

        const balanceKey = ctx.stub.createCompositeKey(balancePrefix, [owner]);

        const balanceBytes = await ctx.stub.getState(balanceKey);
        if (!balanceBytes || balanceBytes.length === 0) {
            throw new Error(`the account ${owner} does not exist`);
        }
        const balance = parseInt(balanceBytes.toString());

        return balance;
    }

    // 從合約轉代幣給B
    async Transfer(ctx, to, value) {

        //check contract options are already set first to execute the function
        await this.CheckInitialized(ctx);

        const clientAccountID = ctx.clientIdentity.getID();

        // Convert value from string to int
        const valueInt = parseInt(value);

        if (valueInt < 0) { // transfer of 0 is allowed in ERC20, so just validate against negative amounts
            throw new Error('transfer amount cannot be negative');
        }

        // Retrieve the current balance of the sender
        const fromBalanceKey = ctx.stub.createCompositeKey(balancePrefix, [clientAccountID]);
        const fromCurrentBalanceBytes = await ctx.stub.getState(fromBalanceKey);

        console.log(fromCurrentBalanceBytes);

        let fromCurrentBalance;
        if (!fromCurrentBalanceBytes || fromCurrentBalanceBytes.length === 0) {
            throw new Error(`the account ${clientAccountID} no balance`);
        } else {
            fromCurrentBalance = parseInt(fromCurrentBalanceBytes.toString());
        }

        // Check if the sender has enough tokens to spend.
        if (fromCurrentBalance < valueInt) {
            throw new Error(`client account ${clientAccountID} insufficient funds`);
        }

        // Retrieve the current balance of the recepient
        const toBalanceKey = ctx.stub.createCompositeKey(balancePrefix, [to]);
        const toCurrentBalanceBytes = await ctx.stub.getState(toBalanceKey);

        let toCurrentBalance;
        // If recipient current balance doesn't yet exist, we'll create it with a current balance of 0
        if (!toCurrentBalanceBytes || toCurrentBalanceBytes.length === 0) {
            throw new Error(`client account ${to} no signup`);
        } else {
            toCurrentBalance = parseInt(toCurrentBalanceBytes.toString());
        }

        // Update the balance
        const fromUpdatedBalance = await this.sub(fromCurrentBalance, valueInt);
        const toUpdatedBalance = await this.add(toCurrentBalance, valueInt);

        await ctx.stub.putState(fromBalanceKey, Buffer.from(fromUpdatedBalance.toString()));
        await ctx.stub.putState(toBalanceKey, Buffer.from(toUpdatedBalance.toString()));

        await this.setAdminTransactionData(ctx, clientAccountID, to, value);

        console.log(`client ${clientAccountID} balance updated from ${fromCurrentBalance} to ${fromUpdatedBalance}`);
        console.log(`recipient ${to} balance updated from ${toCurrentBalance} to ${toUpdatedBalance}`);

        return true;
    }

    

    // 從A轉代幣給B
    async TransferFrom(ctx, from, to, value) {

        if (from === to) {
            throw new Error('cannot transfer to and from same client account');
        }

        // Convert value from string to int
        const valueInt = parseInt(value);

        if (valueInt < 0) { // transfer of 0 is allowed in ERC20, so just validate against negative amounts
            throw new Error('transfer amount cannot be negative');
        }

        // 查詢from的餘額
        const fromBalanceKey = ctx.stub.createCompositeKey(balancePrefix, [from]);
        const fromCurrentBalanceBytes = await ctx.stub.getState(fromBalanceKey);

        let fromCurrentBalance;
        if (!fromCurrentBalanceBytes || fromCurrentBalanceBytes.length === 0) {
            throw new Error(`client account ${from} no balance`);
        } else {
            fromCurrentBalance = parseInt(fromCurrentBalanceBytes.toString());
        }

        // 查看餘額是否有大於要轉出的錢
        if (fromCurrentBalance < valueInt) {
            throw new Error(`client account ${from} insufficient funds`);
        }

        // 查詢to的餘額
        const toBalanceKey = ctx.stub.createCompositeKey(balancePrefix, [to]);
        const toCurrentBalanceBytes = await ctx.stub.getState(toBalanceKey);

        let toCurrentBalance;
        // 如果沒有查到代表沒有註冊
        if (!toCurrentBalanceBytes || toCurrentBalanceBytes.length === 0) {
            throw new Error(`client account ${to} no signup`);
        } else {
            toCurrentBalance = parseInt(toCurrentBalanceBytes.toString());
        }

        // 更新from跟to的餘額
        const fromUpdatedBalance = await this.sub(fromCurrentBalance, valueInt);
        const toUpdatedBalance = await this.add(toCurrentBalance, valueInt);

        await ctx.stub.putState(fromBalanceKey, Buffer.from(fromUpdatedBalance.toString()));
        await ctx.stub.putState(toBalanceKey, Buffer.from(toUpdatedBalance.toString()));

        await this.setFromTransactionData(ctx, from, to, value);
        await this.setToTransactionData(ctx, from, to, value);

        console.log(`client ${from} balance updated from ${fromCurrentBalance} to ${fromUpdatedBalance}`);
        console.log(`recipient ${to} balance updated from ${toCurrentBalance} to ${toUpdatedBalance}`);

        return true;
    }

    // 設定A的交易資訊
    async setFromTransactionData(ctx, from, to, value) {

        await this.CheckInitialized(ctx);

        // 設定前綴+address
        const transactionDataKey = ctx.stub.createCompositeKey(transactionDataPrefix, [from]);
        const transactionDataBytes = await ctx.stub.getState(transactionDataKey);

        if (!transactionDataBytes || transactionDataBytes.length === 0) {
            const transactionData = [{
                from: from,
                to: to,
                value: value,
                time: ctx.stub.getTxTimestamp().array[0].toString()
            }]
            await ctx.stub.putState(transactionDataKey, Buffer.from(JSON.stringify(transactionData)));
        }
        else{
            const transactionData = JSON.parse(transactionDataBytes);
        
            // 設定交易紀錄
            const newTransactionData = {
                from: from,
                to: to,
                value: value,
                time: ctx.stub.getTxTimestamp().array[0].toString()
            }
    
            transactionData.push(newTransactionData);
    
            // 新增資料
            await ctx.stub.putState(transactionDataKey, Buffer.from(JSON.stringify(transactionData)));
        }
        
        // return JSON.stringify(transactionData);
        return true;
    }

    // 設定B的交易資訊
    async setToTransactionData(ctx, from, to, value) {

        await this.CheckInitialized(ctx);

        const transactionDataKey = ctx.stub.createCompositeKey(transactionDataPrefix, [to]);
        const transactionDataBytes = await ctx.stub.getState(transactionDataKey);

        if (!transactionDataBytes || transactionDataBytes.length === 0) {
            const transactionData = [{
                from: from,
                to: to,
                value: value,
                time: ctx.stub.getTxTimestamp().array[0].toString()
            }]
            await ctx.stub.putState(transactionDataKey, Buffer.from(JSON.stringify(transactionData)));
        }
        else{
            const transactionData = JSON.parse(transactionDataBytes);
            
            const newTransactionData = {
                from: from,
                to: to,
                value: value,
                time: ctx.stub.getTxTimestamp().array[0].toString()
            }
            
            transactionData.push(newTransactionData);
     
            // 新增資料
            await ctx.stub.putState(transactionDataKey, Buffer.from(JSON.stringify(transactionData)));
        }

        // return JSON.stringify(transactionData);
        return true;
    }

    // 設定A的交易資訊
    async setAdminTransactionData(ctx, to, value) {

        await this.CheckInitialized(ctx);

        // 設定前綴+address
        const transactionDataKey = ctx.stub.createCompositeKey(transactionDataPrefix, [to]);
        const transactionDataBytes = await ctx.stub.getState(transactionDataKey);

        if (!transactionDataBytes || transactionDataBytes.length === 0) {
            const transactionData = [{
                from: 'admin',
                to: to,
                value: value,
                time: ctx.stub.getTxTimestamp().array[0].toString()
            }]
            await ctx.stub.putState(transactionDataKey, Buffer.from(JSON.stringify(transactionData)));
        }
        else{
            const transactionData = JSON.parse(transactionDataBytes);
        
            // 設定交易紀錄
            const newTransactionData = {
                from: 'admin',
                to: to,
                value: value,
                time: ctx.stub.getTxTimestamp().array[0].toString()
            }
    
            transactionData.push(newTransactionData);
    
            // 新增資料
            await ctx.stub.putState(transactionDataKey, Buffer.from(JSON.stringify(transactionData)));
        }
        
        // return JSON.stringify(transactionData);
        return true;
    }

    // 取得某Address的所有交易資訊
    async getTransactionData(ctx, userAddress) {

        await this.CheckInitialized(ctx);

        const transactionDataKey = ctx.stub.createCompositeKey(transactionDataPrefix, [userAddress]);
        const transactionDataBytes = await ctx.stub.getState(transactionDataKey);

        if (!transactionDataBytes || transactionDataBytes.length === 0) {
            throw new Error(`client account ${userAddress} 沒有交易紀錄`);
        }

        const transactionData = JSON.parse(transactionDataBytes);
        return transactionData;
        
    }

    // ================== Extended Functions ==========================

    /**
     * Set optional infomation for a token.
     *
     * @param {Context} ctx the transaction context
     * @param {String} name The name of the token
     * @param {String} symbol The symbol of the token
     * @param {String} decimals The decimals of the token
     * @param {String} totalSupply The totalSupply of the token
     */
    // 初始化函式 (用cmd org1底下的peer0執行)
    async Initialize(ctx, name, symbol, decimals) {
        // Check minter authorization - this sample assumes Org1 is the central banker with privilege to set Options for these tokens
        const clientMSPID = ctx.clientIdentity.getMSPID();
        if (clientMSPID !== 'Org1MSP') {
            throw new Error('client is not authorized to initialize contract');
        }

        //check contract options are not already set, client is not authorized to change them once intitialized
        const nameBytes = await ctx.stub.getState(nameKey);
        if (nameBytes && nameBytes.length > 0) {
            throw new Error('contract options are already set, client is not authorized to change them');
        }

        await ctx.stub.putState(nameKey, Buffer.from(name));
        await ctx.stub.putState(symbolKey, Buffer.from(symbol));
        await ctx.stub.putState(decimalsKey, Buffer.from(decimals));

        console.log(`name: ${name}, symbol: ${symbol}, decimals: ${decimals}`);
        return true;
    }

    /**
     * Mint creates new tokens and adds them to minter's account balance
     *
     * @param {Context} ctx the transaction context
     * @param {Integer} amount amount of tokens to be minted
     * @returns {Object} The balance
     */
    // 鑄造代幣 (User2憑證去執行)
    async Mint(ctx, amount) {

        //check contract options are already set first to execute the function
        await this.CheckInitialized(ctx);

        // Check minter authorization - this sample assumes Org1 is the central banker with privilege to mint new tokens
        const clientMSPID = ctx.clientIdentity.getMSPID();
        if (clientMSPID !== 'Org1MSP') {
            throw new Error('client is not authorized to mint new tokens');
        }

        // Get ID of submitting client identity
        const minter = ctx.clientIdentity.getID();

        const amountInt = parseInt(amount);
        if (amountInt <= 0) {
            throw new Error('mint amount must be a positive integer');
        }

        const balanceKey = ctx.stub.createCompositeKey(balancePrefix, [minter]);

        const currentBalanceBytes = await ctx.stub.getState(balanceKey);
        // If minter current balance doesn't yet exist, we'll create it with a current balance of 0
        let currentBalance;
        if (!currentBalanceBytes || currentBalanceBytes.length === 0) {
            currentBalance = 0;
        } else {
            currentBalance = parseInt(currentBalanceBytes.toString());
        }
        const updatedBalance = this.add(currentBalance, amountInt);

        await ctx.stub.putState(balanceKey, Buffer.from(updatedBalance.toString()));

        // Increase totalSupply
        const totalSupplyBytes = await ctx.stub.getState(totalSupplyKey);
        let totalSupply;
        if (!totalSupplyBytes || totalSupplyBytes.length === 0) {
            console.log('Initialize the tokenSupply');
            totalSupply = 0;
        } else {
            totalSupply = parseInt(totalSupplyBytes.toString());
        }
        totalSupply = this.add(totalSupply, amountInt);
        await ctx.stub.putState(totalSupplyKey, Buffer.from(totalSupply.toString()));

        // Emit the Transfer event
        const transferEvent = { from: '0x0', to: minter, value: amountInt };
        ctx.stub.setEvent('Transfer', Buffer.from(JSON.stringify(transferEvent)));

        console.log(`minter account ${minter} balance updated from ${currentBalance} to ${updatedBalance}`);
        return true;
    }

    /**
     * Burn redeem tokens from minter's account balance
     *
     * @param {Context} ctx the transaction context
     * @param {Integer} amount amount of tokens to be burned
     * @returns {Object} The balance
     */
    // 銷毀代幣
    async Burn(ctx, amount) {

        //check contract options are already set first to execute the function
        await this.CheckInitialized(ctx);

        // Check minter authorization - this sample assumes Org1 is the central banker with privilege to burn tokens
        const clientMSPID = ctx.clientIdentity.getMSPID();
        if (clientMSPID !== 'Org1MSP') {
            throw new Error('client is not authorized to mint new tokens');
        }

        const minter = ctx.clientIdentity.getID();

        const amountInt = parseInt(amount);

        const balanceKey = ctx.stub.createCompositeKey(balancePrefix, [minter]);

        const currentBalanceBytes = await ctx.stub.getState(balanceKey);
        if (!currentBalanceBytes || currentBalanceBytes.length === 0) {
            throw new Error('The balance does not exist');
        }
        const currentBalance = parseInt(currentBalanceBytes.toString());
        const updatedBalance = this.sub(currentBalance, amountInt);

        await ctx.stub.putState(balanceKey, Buffer.from(updatedBalance.toString()));

        // Decrease totalSupply
        const totalSupplyBytes = await ctx.stub.getState(totalSupplyKey);
        if (!totalSupplyBytes || totalSupplyBytes.length === 0) {
            throw new Error('totalSupply does not exist.');
        }
        const totalSupply = this.sub(parseInt(totalSupplyBytes.toString()), amountInt);
        await ctx.stub.putState(totalSupplyKey, Buffer.from(totalSupply.toString()));

        // Emit the Transfer event
        const transferEvent = { from: minter, to: '0x0', value: amountInt };
        ctx.stub.setEvent('Transfer', Buffer.from(JSON.stringify(transferEvent)));

        console.log(`minter account ${minter} balance updated from ${currentBalance} to ${updatedBalance}`);
        return true;
    }

    /**
     * ClientAccountBalance returns the balance of the requesting client's account.
     *
     * @param {Context} ctx the transaction context
     * @returns {Number} Returns the account balance
     */
    // 查詢User2餘額
    async ClientAccountBalance(ctx) {

        //check contract options are already set first to execute the function
        await this.CheckInitialized(ctx);

        // Get ID of submitting client identity
        // 取得User2 x509憑證等等
        const clientAccountID = ctx.clientIdentity.getID();

        const balanceKey = ctx.stub.createCompositeKey(balancePrefix, [clientAccountID]);
        const balanceBytes = await ctx.stub.getState(balanceKey);
        if (!balanceBytes || balanceBytes.length === 0) {
            throw new Error(`the account ${clientAccountID} does not exist`);
        }
        const balance = parseInt(balanceBytes.toString());

        return balance;
    }

    // // ClientAccountID returns the id of the requesting client's account.
    // // In this implementation, the client account ID is the clientId itself.
    // // Users can use this function to get their own account id, which they can then give to others as the payment address
    async ClientAccountID(ctx) {

        //check contract options are already set first to execute the function
        await this.CheckInitialized(ctx);

        // Get ID of submitting client identity
        const clientAccountID = ctx.clientIdentity.getID();
        return clientAccountID;
    }

    //Checks that contract options have been already initialized
    // 檢查本合約是否初始化
    async CheckInitialized(ctx){
        const nameBytes = await ctx.stub.getState(nameKey);
        if (!nameBytes || nameBytes.length === 0) {
            throw new Error('contract options need to be set before calling any function, call Initialize() to initialize contract');
        }
    }

    // add two number checking for overflow
    async add(a, b) {
        let c = a + b;
        if (a !== c - b || b !== c - a){
            throw new Error(`Math: addition overflow occurred ${a} + ${b}`);
        }
        return c;
    }

    // add two number checking for overflow
    async sub(a, b) {
        let c = a - b;
        if (a !== c + b || b !== a - c){
            throw new Error(`Math: subtraction overflow occurred ${a} - ${b}`);
        }
        return c;
    }
}

module.exports = TokenERC20Contract;
