import { EnvOptions, VocdoniSDKClient } from "@vocdoni/sdk"
import * as fs from "node:fs"
import * as path from "node:path"
import dotenv from 'dotenv';
dotenv.config()
import { Wallet } from "@ethersproject/wallet"
import qrcode from "qrcode"

import readline from 'readline'
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
})
import  csvLoadSync from 'csv-load-sync'
import latinize from "latinize"  


// const question = util.promisify(rl.question).bind(rl)
const question = (query: string) => new Promise((resolve) => rl.question(query, resolve))

const VOCDONI_ENVIRONMENT = EnvOptions.DEV
const BASE_URL = "https://app-dev.vocdoni.io/processes/"
const ELECTION_ID = process.env.ELECTION_ID
const ORG_ID = process.env.ORGANIZATION_ID
console.log(ELECTION_ID)
console.log(ORG_ID)


const PUBLIC_KEYS_FILE = "public_keys_" // The relative path and name of the file containing the public keys
const PRIVATE_KEYS_FILE = "private_keys_" // The relative path and name of the file containing the public keys
// const GENERATE_RANDOM_KEYS_NUM = 330 // The number of random generated wallets

let client: VocdoniSDKClient
let publicKeys: string[] = [] // The list of public keys used to generate claims
let privateKeys: string[] = [] // The list of public keys used to generate claims

let censusName: String
let records: { Pes: string; Codi: string }[]

/**
 * Initialize gateway
 */
async function initGateway() {
    client = new VocdoniSDKClient({
        env: VOCDONI_ENVIRONMENT,
        // wallet: entityWallet
    })
}


/**
 * Reads file from disk containing the public keys
 */
function loadCensusPublicKeysFromFile() {
    try {
        const strData = fs.readFileSync("./" + censusName + PUBLIC_KEYS_FILE + ".txt").toString()
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
        const strData = fs.readFileSync("./" + censusName + PRIVATE_KEYS_FILE + ".txt").toString()
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

const caclulateVoterWallet = async (voterDataObject: object): Promise<Wallet>  => {
    const normalizeText = (text?: string): string => {
        if (!text) return ''

        const result = text
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/[\.·:]/g, '.')
            .replace(/[`´]/g, "'")
            .normalize()
            .toLowerCase()

        return latinize(result)
    }

    const walletFromRow = (salt: string, row: string[]) => {
        const normalized = row.map(normalizeText)
        normalized.push(salt)
        return VocdoniSDKClient.generateWalletFromData(normalized)
    }

    const hid = await client.electionService.getNumericElectionId(ELECTION_ID)
    const salt = await client.electionService.getElectionSalt(ORG_ID, hid)
    return walletFromRow(salt, Object.values(voterDataObject))
}


async function loadCensusPrivateKeysFromCSV() {
    try {
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
            columnNames = String(await question('Column names to be used for pivKey (separ ated by commas - ;) or empty for all columns?\n'))
            if (columnNames.length > 0) {
                columns = columnNames.split(";").map(x => x.trim())
            }
        } catch (err) {
            console.error('Question rejected', err);
        }
        const records: Object[] = csvLoadSync.load('./' + file)

        await records.forEach(async (element) => {
            if (columns.length > 0)
                element = Object.fromEntries(Object.entries(element).filter(x => columns.indexOf(x[0]) > -1))
            const voterWallet = await caclulateVoterWallet(element)
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
        fs.writeFileSync("./" + censusName + PUBLIC_KEYS_FILE + ".txt", publicKeys.join("\n"))
    } catch (err) {
        console.error("Could not write public keys file", err)
        process.exit(1)
    }
}

function storeCensusPrivateKeysToFile() {
    try {
        fs.writeFileSync("./" + censusName + PRIVATE_KEYS_FILE + ".txt", privateKeys.join("\n"))
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
async function generateRandomCensusPublicKeys(num: number = 10) {
    for (let i = 0; i < num; i++) {
        const wallet = Wallet.createRandom()
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


async function generateQR(processID: String, id: number, records: { Pes: string; Codi: string }) {
    const fileName = path.resolve('./' + processID + '/' + records['Pes'] + "-" + records['Codi'] + '.svg')
    const url = BASE_URL + processID + '#' + privateKeys[id]
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

    let file = "file.csv"
    try {
        file = String(await question('CSV filename?\n'))
    } catch (err) {
        console.error('Question rejected', err);
    }
    records = csvLoadSync.load(path.resolve('./' + file))
    fs.mkdirSync(path.resolve('./' + ELECTION_ID))
    privateKeys.map((_, i) => generateQR(ELECTION_ID, i, records[i]))

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
