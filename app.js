require("dotenv").config();
const fs = require('fs');
const path = require('node:path');
const ethers = require("ethers");

const { LYBRA_STETH_ABI } = require("./utils/lybraStEthABI");
const { LIDO_STETH_ABI } = require("./utils/lidoStEthABI");
const { LYBRA_HELPER_ABI } = require("./utils/lybraHelperABI");

const Discord = require("discord.js");
const { IntentsBitField, EmbedBuilder, Client, Events, GatewayIntentBits, Collection } = require("discord.js");

const clientDiscord = new Discord.Client({ intents: [IntentsBitField.Flags.Guilds, IntentsBitField.Flags.GuildMessages, IntentsBitField.Flags.MessageContent, GatewayIntentBits.Guilds] });

const provider = new ethers.JsonRpcProvider("https://rpc.ankr.com/eth")
const signer = new ethers.Wallet(process.env.WALLET_PK, provider);

//Contracts
const lybraHelperContract = new ethers.Contract(process.env.LYBRA_HELPER_ADDRESS, LYBRA_HELPER_ABI, signer);

//auxs
let countAlertWstETH = 0;
let maxValueWstETH = 0;

let countAlertWbETH = 0;
let maxValueWbETH = 0;

let countAlertRETH = 0;
let maxValueRETH = 0;

async function getPoolsAmount(){
  const users = JSON.parse(fs.readFileSync(`${__dirname}/utils/files/poolUsers.json`))

  const assetsPrices = await Promise.all([
    lybraHelperContract.getAssetPrice(process.env.LYBRA_WSTETH_ADDRESS),
    lybraHelperContract.getAssetPrice(process.env.LYBRA_WBETH_ADDRESS),
    lybraHelperContract.getAssetPrice(process.env.LYBRA_RETH_ADDRESS)
  ]);

  const redeemableAmounts = await Promise.all([
    lybraHelperContract.getRedeemableAmount(users["wsteth"], process.env.LYBRA_WSTETH_ADDRESS),
    lybraHelperContract.getRedeemableAmount(users["wbeth"], process.env.LYBRA_WBETH_ADDRESS),
    lybraHelperContract.getRedeemableAmount(users["reth"], process.env.LYBRA_RETH_ADDRESS)
  ]);

  const poolWstETH = parseFloat(ethers.formatEther(redeemableAmounts[0])/Number(assetsPrices[0]/BigInt(1e8))).toFixed(3);
  const poolWbETH = parseFloat(ethers.formatEther(redeemableAmounts[1])/Number(assetsPrices[1]/BigInt(1e8))).toFixed(3);
  const poolRETH = parseFloat(ethers.formatEther(redeemableAmounts[2])/Number(assetsPrices[2]/BigInt(1e8))).toFixed(3);

  return { poolWstETH, poolWbETH, poolRETH }
}

function alertIfBigger(poolAmounts, minValues){

  const embedMessage = new EmbedBuilder()
    .setColor(0x2b2b2b)
    .setTitle('Ξ Pool Reward')
    .setURL('https://lybra.finance/dashboard')
    .addFields(
      { name: '\u200B', value: 'Uma das Pools está com o valor alvo', inline: false},
      { name: '**wstETH**', value: `${poolAmounts[0]}`, inline: true },
      { name: '**wbETH**', value: `${poolAmounts[1]}`, inline: true },
      { name: '**rETH**', value: `${poolAmounts[2]}`, inline: true },
      { name: '\u200B', value: '\u200B', inline: false}
    )
    .setTimestamp()
    .setFooter({ text: 'Lybra Finance Alert'});

  if(poolAmounts[0] >= minValues[0] && countAlertWstETH < 2){
    countAlertWstETH++
    maxValueWstETH = poolAmounts[0];
    clientDiscord.channels.cache.get(process.env.ALERT_CHANNEL).send({ content: "@everyone **wstETH**", embeds: [embedMessage] });
  }
  
  if(poolAmounts[1] >= minValues[1] && countAlertWbETH < 2){
    countAlertWbETH++
    maxValueWbETH = poolAmounts[1];
    clientDiscord.channels.cache.get(process.env.ALERT_CHANNEL).send({ content: "@everyone **wbETH**", embeds: [embedMessage] });
  }

  if(poolAmounts[2] >= minValues[2] && countAlertRETH < 2){
    countAlertRETH++
    maxValueRETH = poolAmounts[2]
    clientDiscord.channels.cache.get(process.env.ALERT_CHANNEL).send({ content: "@everyone **rETH**", embeds: [embedMessage] });
  }
}

clientDiscord.on('ready', async (c) => {

  console.log(`Ready! Logged in as ${c.user.tag}`);

  setInterval(async () => {
    let { poolWstETH, poolWbETH, poolRETH } = await getPoolsAmount();
    const values = JSON.parse(fs.readFileSync(`${__dirname}/utils/files/alertValue.json`));

    if(poolWstETH < maxValueWstETH)
      countAlertWstETH = 0
    
    if(poolWbETH < maxValueWbETH)
      countAlertWbETH = 0

    if(poolRETH < maxValueRETH)
      countAlertRETH = 0

    alertIfBigger([poolWstETH,poolWbETH,poolRETH], [values["wsteth"], values["wbeth"], values["reth"]]);
  }, 60000);

});

clientDiscord.on("messageCreate", async msg => {
  if (msg.author.bot) return false 

  if(msg.content == "!check-values"){
    let { poolWstETH, poolWbETH, poolRETH } = await getPoolsAmount();
    msg.reply({content: `${poolWstETH} wstETH\n${poolWbETH} wbETH\n${poolRETH} rETH`})
  }
});

clientDiscord.login(process.env.TOKEN);

//Slash commands discord
clientDiscord.commands = new Collection();
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		// Set a new item in the Collection with the key as the command name and the value as the exported module
		if ('data' in command && 'execute' in command) {
			clientDiscord.commands.set(command.data.name, command);
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

clientDiscord.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;

	const command = interaction.client.commands.get(interaction.commandName);

	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	try {
		await command.execute(interaction);
	} catch (error) {
		console.error(error);
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
		} else {
			await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
		}
	}
});
