const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, EmbedBuilder   } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('set-alert')
		.setDescription('Registra o valor desejado que tenha na pool para ser notificado')

    .addNumberOption(field => 
      field.setName('value')
        .setDescription('Valor em ETH')
        .setRequired(true)
    )

		.addStringOption(question =>
			question.setName('pool')
				.setDescription('qual pool você deseja?')
				.setRequired(true)
        .addChoices(
          { name: 'wstETH', value: 'wsteth' },
          { name: 'WBETH', value: 'wbeth' },
          { name: 'rETH', value: 'reth' },
        )
    )
	,

	async execute(interaction) {
    const pool = interaction.options.getString('pool');
    const value = interaction.options.getNumber('value')
    
    try {
      
      let values = JSON.parse(fs.readFileSync(path.join(__dirname, '../../utils/files/alertValue.json')));
      values[pool] = value;

      fs.writeFileSync(path.join(__dirname, '../../utils/files/alertValue.json'), JSON.stringify(values, null, 2));

      interaction.reply(`Valor alterado com sucesso para: **${value} ${pool}**`);
    } catch (error) {
      console.log(error);

      interaction.reply("Ocorreu um erro ao salvar valor. Tente novamente!")
    }
	},
};