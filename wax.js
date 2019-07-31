const Discord = require("discord.js");
const client = new Discord.Client();
const request = require('request');
const config = require('./config.json').wax;
const DOMParser = require('dom-parser');

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

const channels = config.channel;

client.on('message', msg => {
    // channel filter, only wax room
    if (!channels.includes(msg.channel.id) || msg.author.bot) {
        return;
    }
    // regex to clean up whitespaces
    var slots = msg.content.replace(/ +/g, " ").replace(/([A-z])(\d)/g, "$1 $2").toLowerCase().split("\n").map(x => x.split(",").map(x => x.trim().split(" ")));

    // wax calls must be 4 lines of comma-separated calls
    if (slots.length != 4 || !slots.every(s => s.length > 0 && s.every(r => r.length === 2))) {
        if (slots.length > 2) {
            msg.channel.send("invalid input data, please make sure you're not missing any commas or spaces");
        }
        return;
    }

    request.post('https://runescape.wiki/w/Calculator:Rune_Goldberg_Machine_2?action=purge', {form: {wpEditToken: "+\\", title: "Calculator:Rune Goldberg Machine 2"}, followAllRedirects: true}, (err, res, body) => {
        if (err) {
            return console.log(err);
        }
        let parser = new DOMParser();
        let doc = parser.parseFromString(body)
        let waxPrice = parseInt(doc.getElementsByTagName("p").filter(t => t.innerHTML.includes("The current GE price for one vis wax"))[0].getElementsByTagName("span")[0].innerHTML.replace(",",""))

        let runePrices = {};
        let runeTable = doc.getElementsByClassName("wikitable sortable")[0].firstChild.childNodes.slice(1)
        runeTable.forEach(e => {
            rune = e.childNodes[0].lastChild.innerHTML.replace(" rune","");
            price = parseInt(e.childNodes[3].lastChild.innerHTML.replace(",",""));
            runePrices[waxVals[rune.toLowerCase()].name] = price
        })

        try {
            waxFinder = new WaxFinder(runePrices, waxPrice);
            results = waxFinder.find(slots);

            var date = new Date().toLocaleDateString("en-GB", {
                timeZone: "UTC",
                month: "short",
                day: "2-digit",
                year: "numeric"
            });
            var message = `${date}\n${waxFinder.format(results)}`
            msg.channel.send(message.replace(/(\*|_|`|~|\\)/g, '\\$1'));
            msg.delete(500);
        } catch (e) {
            if (!(e instanceof Promise)) {
                throw e;
            }
        }
    });
});

client.login(config.token);


// for pretty formatting
const waxVals = {
    air: {name: 'Air', qty: 1000, storePrice: 17},
    astral: {name: 'Astral', qty: 300, storePrice: 220},
    blood: {name: 'Blood', qty: 350, storePrice: 550},
    body: {name: 'Body', qty: 2000, storePrice: 16},
    chaos: {name: 'Chaos', qty: 500, storePrice: 140},
    cosmic: {name: 'Cosmic', qty: 400, storePrice: 232},
    death: {name: 'Death', qty: 400, storePrice: 310},
    dust: {name: 'Dust', qty: 500, storePrice: Infinity},
    earth: {name: 'Earth', qty: 1000, storePrice: 17},
    fire: {name: 'Fire', qty: 1000, storePrice: 17},
    lava: {name: 'Lava', qty: 500, storePrice: Infinity},
    law: {name: 'Law', qty: 300, storePrice: 378},
    mind: {name: 'Mind', qty: 2000, storePrice: 17},
    mist: {name: 'Mist', qty: 500, storePrice: Infinity},
    mud: {name: 'Mud', qty: 500, storePrice: Infinity},
    nature: {name: 'Nature', qty: 350, storePrice: 372},
    smoke: {name: 'Smoke', qty: 500, storePrice: Infinity},
    soul: {name: 'Soul', qty: 300, storePrice: 410},
    steam: {name: 'Steam', qty: 500, storePrice: Infinity},
    water: {name: 'Water', qty: 1000, storePrice: 17}
}

class WaxFinder {

    constructor(runePrices, waxPrice) {
        this.runePrices = runePrices;
        this.waxPrice = waxPrice;
    }

    // Adding a method to the constructor
    find(slots) {
        var rawRuneSets = slots.map(s => s.map(r => {
            const runeWaxData = waxVals[r[0]];
            const rune = runeWaxData.name;
            const qty = parseInt(r[1]);
            const profit = qty * this.waxPrice - runeWaxData.qty * this.runePrices[rune];
            const imCost = (runeWaxData.qty * runeWaxData.storePrice) / qty;
            return {rune, qty, profit, imCost, green: (qty === 30)};
        })).map(c => c.sort((a, b) => b.profit - a.profit));
        // if the best rune conflicts between slot 1 and one of the slot 2 choices
        var conflictExists = rawRuneSets.slice(1).map(r => r[0].rune).includes(rawRuneSets[0][0].rune);

        // slot 2 possibilities sorted by best profit
        var rawSetsSlot2Sorted = [rawRuneSets[0], ...rawRuneSets.slice(1).sort((a, b) => a[0].profit - b[0].profit)];
        var skipConflict;
        var filteredRuneSets = rawSetsSlot2Sorted.map(s => {
            let greenIdx = s.findIndex(x => x.green);
            // todo: tighten cutoff and put green separately
            let cutoffIdx = Math.max(s.findIndex(x => x.profit + 5000 < s[0].profit), greenIdx + 1);
            if (cutoffIdx === 1) {
                // if green is best
                const conflict = conflictExists && (s[0].rune === rawSetsSlot2Sorted[0][0].rune);
                // and there is a conflict, try to include an extra rune for conflict resolution
                if (conflict) {
                    if (!s[1]) {
                        skipConflict = `There may be a better combo if you provide alts for the conflicting \`${rawSetsSlot2Sorted[0][0].rune}\` slot`;
                    } else {
                        s[1].includedForConflict = true;
                        cutoffIdx = 2;
                    }
                }
            }
            const bestRunes = s.slice(0, cutoffIdx);
            // add ironman alt if there is one available
            const bestImRune = s.slice().sort((a, b) => a.imCost - b.imCost)[0];
            if (!bestRunes.includes(bestImRune)) {
                bestImRune.im = true;
                bestRunes.push(bestImRune);
            }
            return bestRunes;
        });

        var bestRunes;
        if (conflictExists && !skipConflict) {
            var slot1best = [];
            var slot2best = [];
            var slot1 = filteredRuneSets[0];
            filteredRuneSets.slice(1).forEach(r => {
                if (slot1[0].rune != r[0].rune) { // for the non-conflicting slot 2 possibilities
                    slot1best.push(slot1[0]);
                    slot2best.push(r[0]);
                    return;
                } else if (slot1[0].profit + r[1].profit > slot1[1].profit + r[0].profit) {
                    slot1best.push(slot1[0]);
                    slot2best.push(r[1]);
                    r[1].usedForConflict = true
                } else {
                    slot1best.push(slot1[1]);
                    slot2best.push(r[0]);
                    slot1[1].usedForConflict = true
                }
            });
            slot1best = [...new Set(slot1best)].sort((a, b) => b.profit - a.profit).map(x => x.rune).join("/"); // dedupe slot 1
            bestRunes = [slot1best, ...slot2best.map(x => x.rune)];
        } else {
            bestRunes = filteredRuneSets.map(r => r[0].rune);
        }

        // green rune + up to 3 alts
        let waxRunes = filteredRuneSets.map(s => {
            const green = s.find(x => x.green)
            const alts = s.filter(x => !x.green && (!x.includedForConflict || x.usedForConflict)).slice(0, 3)
            return {green, alts}
        });

        return {
            slot1: {
                green: waxRunes[0].green,
                alts: waxRunes[0].alts,
                best: bestRunes[0]
            },
            slot2: [1, 2, 3].map(n => {
                return {
                    green: waxRunes[n].green,
                    alts: waxRunes[n].alts,
                    best: bestRunes[n]
                }
            }),
            skipConflict
        };
    }

    format(data) {
        console.log(JSON.stringify(data));
        function formatSlot(slot) {
            const green = slot.green.rune
            const alts = slot.alts.map(x => `${x.rune} ${x.qty}${x.im ? '*' : ''}`).join(', ')
            return alts ? `${green} (${alts})` : green
        }

        var message = `Slot 1:\n  - ${formatSlot(data.slot1)}\nSlot 2\n${data.slot2.map(s => `  - ${formatSlot(s)}`).join('\n')}\nBest Runes: ${data.slot1.best} ${data.slot2.map(s => s.best).join(' ')}`
        if (message.includes("*")) {
            message += "\n* Recommended for Ironman accounts. More profitable runes are available for normal players";
        }
        if (data.skipConflict) {
            message += `\n${data.skipConflict}`;
        }
        return message
    }
}

module.exports = WaxFinder;
