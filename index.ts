import { ethers } from "ethers"
import * as fs from "fs"
const { CensusOffChainApi, Gateway, GatewayInfo, CensusOffChain, normalizeText } = require("dvote-js")
// import { CensusOffChainApi, Gateway, GatewayInfo, CensusOffChain } from "dvote-js"
const { Wallet } = require("ethers")
const qrcode = require("qrcode")

const readline = require('readline')
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
})
const util = require('util')
const { load } = require('csv-load-sync');

// const question = util.promisify(rl.question).bind(rl)
const question = (query: String) => new Promise((resolve) => rl.question(query, resolve))

const NETWORK_ID = "xdai"
const VOCDONI_ENVIRONMENT = "prod"
const BOOTNODES_URL = "https://bootnodes.vocdoni.net/gateways.priv.json" // The uri from which contains the available gateway
const ETH_PATH = "m/44'/60'/0'/0/1"
// If concrete gateway is used
const GATEWAY_PUB_KEY = "039e20ccbe4d9ef068916117dc6216d94ebbf461eed2f7186fc080001cdfe43da4"
const GATEWAY_DVOTE_URI = "https://gw2-azeno.vocdoni.net/dvote"
const GATEWAY_WEB3_URI = "https://xdaiaragon.network"
const BASE_URL = "https://vocdoni.app/pub/votes/auth/link/#/"

/**
 * TEST WALLET
 * phrase (mnemonic): 'carry digital wear gift share wheel once amount dentist couch beauty jacket'
 * path: "m/44'/60'/0'/0/0"
 * locale: 'en'
 * address: '0xeD6bdA6f0788C1E06C59781Efe5433619C5b4B99'
 * privateKey: '0x8c26c9510ac2f74ed9ae519e024d175cbed74490a84295a993ba3ed0792646a7'
 * publicKey: '0x04049892fcb0273154e09e19b5184bb7d99af647f4743a321523fdee78ed6a7688ac951c4bfdba98ac52754617865509433f9ce84bab6e82ed9e0d421b692d5694'
 */
// const WALLET_MNEMONIC = "carry digital wear gift share wheel once amount dentist couch beauty jacket" // The Wallet mnemonic
const WALLET_MNEMONIC = "lava wet scene minute catalog city nephew ugly lift impact tape negative" // The Wallet mnemonic
const PUBLIC_KEYS_FILE = "public_keys_" // The relative path and name of the file containing the public keys
const PRIVATE_KEYS_FILE = "private_keys_" // The relative path and name of the file containing the public keys
const GENERATE_RANDOM_KEYS_NUM = 330 // The number of random generated wallets

type Wall = typeof Wallet
let gw: typeof Gateway // The Gateway instance connected to a remote Gateway
let publicKeys: string[] = [] // The list of public keys used to generate claims
let privateKeys: string[] = [] // The list of public keys used to generate claims
const entityWallet = Wallet.fromMnemonic(WALLET_MNEMONIC) // The entity Wallet (creator of the Census)

let censusName: String
let records: { Pes: string; Codi: string }[]

/**
 * Initialize gateway
 */
async function initGateway() {
    await initRandomGatewayFromUri()
    // await initGatewayFromInfo()
}

/**
 * Initialize random gateway from uri
 */
async function initRandomGatewayFromUri() {
    try {
        gw = await Gateway.randomfromUri(NETWORK_ID, BOOTNODES_URL, ['census'], VOCDONI_ENVIRONMENT)
        await gw.init()
    }
    catch (err) {
        console.error("The gateway can't be reached", err)
    }
}

/**
 * Initialize gateway from given information
 */
async function initGatewayFromInfo() {
    try {
        const gwInfo = new GatewayInfo(GATEWAY_DVOTE_URI, ['census'], GATEWAY_WEB3_URI, GATEWAY_PUB_KEY)
        gw = await Gateway.fromInfo(gwInfo, VOCDONI_ENVIRONMENT)
        await gw.init()
    }
    catch (err) {
        console.error("The gateway can't be reached", err)
    }
}

/**
 * Reads file from disk containing the public keys
 */
function loadCensusPublicKeysFromFile() {
    try {
        const strData = fs.readFileSync(__dirname + "/" + censusName + PUBLIC_KEYS_FILE + ".txt").toString()
        for (const line of strData.split(/[\r\n]+/)) {
            if (line) {
                publicKeys.push(line)
            }
        }
    } catch (err) {
        console.error("Could not read public keys file", err)
        process.exit(1)
    }
}

function loadCensusPrivateKeysFromFile() {
    try {
        const strData = fs.readFileSync(__dirname + "/" + censusName + PRIVATE_KEYS_FILE + ".txt").toString()
        for (const line of strData.split(/[\r\n]+/)) {
            if (line) {
                privateKeys.push(line)
            }
        }
    } catch (err) {
        console.error("Could not read public keys file", err)
        process.exit(1)
    }
}

const importedRowToString = (row: string[], entityId: string): string => {
    return row.reduce((i, j) => { return i + j }) + entityId
}

const digestedWalletFromString = (data: string) => {
    const bytes = ethers.utils.toUtf8Bytes(data)
    const hashed = ethers.utils.keccak256(bytes)
    return new ethers.Wallet(hashed)
}

async function loadCensusPrivateKeysFromCSV() {
    try {
        // const strData = fs.readFileSync("isoc-census-2022.csv").toString()
        let file = "file.csv"
        let entityId = "0x..."
        let columnNames = ""
        let columns: string[] = []
        try {
            file = String(await question('CSV filename?\n'))
        } catch (err) {
            console.error('Question rejected', err);
        }
        try {
            entityId = String(await question('entityId?\n'))
        } catch (err) {
            console.error('Question rejected', err);
        }
        try {
            columnNames = String(await question('Column names to be used for pivKey (separ ated by commas - ;) or empty for all columns?\n'))
            if (columnNames.length > 0) {
                columns = columnNames.split(";").map(x => x.trim())
            }
        } catch (err) {
            console.error('Question rejected', err);
        }
        const records: Object[] = load('./' + file)

        records.forEach(element => {
            // console.log(element)
            if (columns.length > 0)
                element = Object.fromEntries(Object.entries(element).filter(x => columns.indexOf(x[0]) > -1))
            // console.log(element)
            const normalizedRow = Object.values(element).map(x => normalizeText(x))
            // Concatenate the row with the entityId to get the payload to generate the private key
            const payload = importedRowToString(normalizedRow, ethers.utils.getAddress(entityId))
            const voterWallet: ethers.Wallet = digestedWalletFromString(payload)
            privateKeys.push(voterWallet.privateKey)
            publicKeys.push(voterWallet.publicKey)
        })
        try {
            censusName = String(await question('Census Name?\n'))
        } catch (err) {
            console.error('Question rejected', err);
        }
        storeCensusPrivateKeysToFile()
        storeCensusPublicKeysToFile()
    } catch (err) {
        console.error("Could not read public keys file", err)
        process.exit(1)
    }
}

function storeCensusPublicKeysToFile() {
    try {
        fs.writeFileSync(__dirname + "/" + censusName + PUBLIC_KEYS_FILE + ".txt", publicKeys.join("\n"))
    } catch (err) {
        console.error("Could not write public keys file", err)
        process.exit(1)
    }
}

function storeCensusPrivateKeysToFile() {
    try {
        fs.writeFileSync(__dirname + "/" + censusName + PRIVATE_KEYS_FILE + ".txt", privateKeys.join("\n"))
    } catch (err) {
        console.error("Could not read public keys file", err)
        process.exit(1)
    }
}

/**
 * Creates random wallets and stores it's public key
 *
 * @param num The number of wallets to generate
 */
async function generateRandomCensusPublicKeys(num: Number = 10) {
    for (let i = 0; i < num; i++) {
        const wallet: Wall = Wallet.createRandom({ path: ETH_PATH }) as Wall
        // console.log(wallet.privateKey)
        // console.log(wallet.mnemonic)
        publicKeys.push(wallet.publicKey)
        privateKeys.push(wallet.privateKey)
    }
    try {
        censusName = String(await question('Census Name?\n'))
    } catch (err) {
        console.error('Question rejected', err);
    }
    storeCensusPrivateKeysToFile()
    storeCensusPublicKeysToFile()
}

/**
 * Populates the census from random wallets or from file containing public keys
 */
async function populateCensus() {
    // await generateRandomCensusPublicKeys(GENERATE_RANDOM_KEYS_NUM)
    await loadCensusPrivateKeysFromCSV()
    //loadCensusPublicKeysFromFile()
    console.log("Found", publicKeys.length, "public keys")
}

/**
 * Asks the Gateway to create a new census, adds the public keys and publishes it
 */
async function publishVoteCensus() {

    // Census parameters
    const censusNameToUpload = censusName + Math.random().toString().substr(2, 6)
    let infoFileName = __dirname + '/' + censusNameToUpload + '_info.txt'
    let infoData: String[] = []
    // Public key(s) that can manage this census
    const managerPublicKeys = [entityWallet.publicKey]
    // The list of claims to add (base64 encoded public key)
    // console.log(publicKeys)
    // console.log(gw)
    const publicKeyClaimsList: { key: string }[] = publicKeys.map(k => (
        { key: CensusOffChain.Public.encodePublicKey(k) }
    ))

    // Asks the Gateway to create a new census
    let { censusId } = await CensusOffChainApi.addCensus(censusNameToUpload, managerPublicKeys, entityWallet, gw)
    console.log(`Census added: "${censusNameToUpload}" with ID ${censusId}`)
    infoData.push(`Census added: "${censusNameToUpload}" with ID ${censusId}`)

    // Add claims to the new census
    let result = await CensusOffChainApi.addClaimBulk(censusId, publicKeyClaimsList, true, entityWallet, gw)
    console.log("Added", publicKeys.length, "claims to", censusId)
    infoData.push("Added " + publicKeys.length + " claims to" + censusId)
    // Show the invalid claims if exist
    if (result.invalidClaims.length > 0) {
        console.error("Invalid claims", result.invalidClaims)
    }

    // Publish the census (make it public)
    const merkleTreeOrigin = await CensusOffChainApi.publishCensus(censusId, entityWallet, gw)
    console.log("Census published on", merkleTreeOrigin)
    infoData.push("Census published on", merkleTreeOrigin)

    // Asks for the merkle root
    const merkleRoot = await CensusOffChainApi.getRoot(censusId, gw)
    console.log("Census Merkle Root:", merkleRoot)
    infoData.push("Census Merkle Root: " + merkleRoot)
    fs.writeFileSync(infoFileName, infoData.join("\n"))
}

async function generateQR(processID: String, id: number, records: { Pes: string; Codi: string }) {
    // const fileName = __dirname + '/' + processID + '/' + privateKeys[id] + "-" + records["Id"] + "-" + records['Codi'] + '.svg'
    const fileName = __dirname + '/' + processID + '/' + records['Pes'] + "-" + records['Codi'] + '.svg'
    const url = BASE_URL + processID + '/' + privateKeys[id]
    try {
        await qrcode.toFile(fileName, url)
    } catch (err) {
        console.error(err)
    }
}

async function publish() {
    await initGateway()
    await populateCensus()
    // await publishVoteCensus()
}

async function generateQRs() {
    censusName = String(await question('Census Name?\n'))
    loadCensusPublicKeysFromFile()
    loadCensusPrivateKeysFromFile()

    if (!privateKeys.length) {
        throw new Error("No privateKeys found");
    }

    let processID = String(await question('Voting Process ID?\n'))
    let file = "file.csv"
    try {
        file = String(await question('CSV filename?\n'))
    } catch (err) {
        console.error('Question rejected', err);
    }
    records = load('./' + file)
    fs.mkdirSync(__dirname + '/' + processID)
    privateKeys.map((_, i) => generateQR(processID, i, records[i]))

}

async function main() {
    let action
    try {
        action = Number(await question('Write 1 for generating census and 2 for generating QR codes?\n'))
    } catch (err) {
        console.error('Question rejected', err);
    }
    if (action == 1) {
        await publish()
    }
    else if (action == 2) {
        await generateQRs()
    } else {
        throw new Error("Invalid Option");

    }
}

main()
    .then(() => console.log("DONE"))
    .catch(err => {
        console.error(err)
        process.exit(1)
    })
