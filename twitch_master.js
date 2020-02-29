/* =======================================
 * ========= global variables ============
 * =======================================
 */

/* exports */
var exports = module.exports = {};
exports.map = {}; // json command mapping

/* requires */
var fs  = require('fs'),
	irc = require('irc'),
	crypto = require('crypto'),

	pub = require('./lib/comm').sender(),
	config = require('./config.json'),

	ops = require('./ops.json'),
	blacklist = require('./blacklist.json'),
	filters = require('./filters.json');

/* settings */
var command_interval = 15,
	grp_chan = '#_ektor5_1446326140015',
	modes = [
		'anarchy',
		'democracy',
		'demorchy',
		'monarchy',
		'chaos'
	],
	mode_can_change = true,
	command_mode = 'democracy';
	chaos_quotes = [
		'Should I be afraid of you guys?',
		'I will survive this.',
		'The people who have really made history are the martyrs.',
		'Ordinary morality is only for ordinary people.',
		'Intolerance is evidence of impotence.',
		'I can imagine myself on my death-bed, spent utterly with lust to touch the next world, like a boy asking for his first kiss from a woman.',
		'Science is always discovering odd scraps of magical wisdom and making a tremendous fuss about its cleverness.'
	],

	reload_cd = 23000, // for ops, blacklist and filters
	max_filter_len = 50,

	perc_req =  {
		"system_reset": 50,
		"ctrl-c": 30
	}, // ^ sets the required percentages to be fulfilled for yes

	mouse_range = {
		min: -3000,
		max:  3000
	}; /* jshint ignore:line */
	// ^ so no undefined qemu behaviour occurs, e.g. integer overflow

/* utility */
var twitch_chat = new irc.Client('irc.twitch.tv', config.nick, {
	channels: ['#' + config.nick],
	userName: config.nick,
	password: config.password,
	autoConnect: false
}),
	twitch_group = new irc.Client('192.16.64.180', config.nick, {
		channels: [grp_chan],
		userName: config.nick,
		password: config.password,
		autoConnect: false
	});

/* misc */
var voting_command = null,
	kappa = 'twitchintheshell.com/kappa.html',
	voting_mode = null,
	mouse_vote = null,
	mouse_x = 0,
	mouse_y = 0,
	mouse_z = 0,
	last_exec_cmd = '',
	str_modes = '',
	filter = '',
	last_tally = {}; // keeps users with their responses

/* game related stuff */
var monarch = null,
	monarch_cmd = null,
	influence = 100,
	idle_penalty = 10,

	supports = 0,
	support_value = 20,
	max_supports = 5,

	rebels = 0,
	rebel_value = 10,
	max_rebels = 10; // because uh oh



/* =======================================
 * ============= functions ===============
 * =======================================
 */

/* loads the blacklist */
function load_blacklist()
{
        blacklist = JSON.parse(fs.readFileSync('./blacklist.json', 'utf8'));
}


/* loads the filters */
function load_filters()
{
        filters = JSON.parse(fs.readFileSync('./filters.json', 'utf8'));
}


/* loads the ops */
function load_ops()
{
        ops = JSON.parse(fs.readFileSync('./ops.json', 'utf8'));
}




/* simply returns an integer according to low~high range */
function randomInt (low, high)
{
	return Math.floor(Math.random() * (high - low) + low);
}


/* reports status to the console, client-status and/or twitch chat */
function reportStatus(message, twitch)
{
	pub.send(['client-status', message]);

	if (twitch_chat && config && twitch)
		twitch_chat.say('#' + config.nick, message);

	console.log(message);
}


/* it is supposed to get called before sending a key to qemu*/
function handle_filter(cmd)
{
	filter += cmd;

	if (filter.length > max_filter_len)
		filter = filter.substring(1, filter.length);

	for (var i in filters) {
		if (filter.indexOf(filters[i]) != -1) {
			var y;

			reportStatus('Someone is a bad boy! Taking counter-measures.', true);

			for (y = 0; y < filters[i].length; y++)
				pub.send(['qemu-manager', exports.map.backspace]);

			filter = filter.substring(0, filter.length - filters[i].length);

			pub.send(['qemu-manager', exports.map['ctrl-a']]);

			for (y = 0; y < kappa.length; y++)
				pub.send(['qemu-manager', exports.map[kappa[y]]]);

			pub.send(['qemu-manager', exports.map.enter]);

			break;
		}
	}
}


/* loads the command mapping - exported for testing */
exports.map_load = function()
{
	fs.exists('map.json', function() {
		try {
			var map_new = JSON.parse(fs.readFileSync('./map.json', 'utf8'));
			exports.map = map_new;
			console.log('(Re)loaded map.json');
		} catch (ex) {
			console.log('Could not load map.json');
			console.log(ex);
		}
	});
};


/*
 * see http://stackoverflow.com/a/13794386
 * modified appropriately to return the array's index
 */
function max_int_val_array(array)
{
	var current = -Infinity,
		i = 0,
		length = array.length,
		result;

	for (; i != length; ++i) {
		if (array[i] > current) {
			current = array[i];
			result = i;
		}
	}

	return result;
}


/* demorchy and democracy modes */
function democracy_related()
{
	var command_count  = {};

	if (command_mode == 'demorchy') {
		/* tampering the total messages array (command_count) before it undergoes analysis */
		var demorchy_pool = Math.round(Object.keys(last_tally).length/3),
			users_voted = [],
			rand_int;

		while (users_voted.length < demorchy_pool) {
			for (var user in last_tally) {
				rand_int = crypto.randomBytes(4).readUInt32BE(0);

				if ((rand_int % 2) === 0 && users_voted.indexOf(user) == -1) {
					if (command_count[last_tally[user]] === null)
						command_count[last_tally[user]] = 0;

					command_count[last_tally[user]] += 1;
					users_voted.push(user);
				}
			}
		}
	} else {
		for (var usr in last_tally) {
			if (command_count[last_tally[usr]] === null)
				command_count[last_tally[usr]] = 0;

			command_count[last_tally[usr]] += 1;
		}
	}


	if (Object.keys(command_count).length === 0)
		return null;

	var counts = '',
		percentage,
		percentages = [],
		commands = [];

	for (var command in command_count) {
		percentage = Math.round(command_count[command]/Object.keys(last_tally).length * 100, 2);

		percentages.push(percentage);
		commands.push(command);

		counts += '\'' + command + '\' = ' + percentage + '%, ';
	}
	counts = counts.substring(0, counts.length - 2);

	var winner_index = max_int_val_array(percentages),
		winner = commands[winner_index];

	if (winner === 'yes') {
		for (var cmd in perc_req) {
			if (last_exec_cmd === cmd) {
				if (percentages[winner_index] < perc_req[cmd]) {
					reportStatus('Not enough percentage for yes (needs at least '+
						perc_req[cmd] + ').', true);
					reportStatus('VOTES: ' + counts, true);
					winner = null;
				}

				break;
			}
		}
	}

	if (winner) {
		reportStatus('Winning command: ' + winner, true);
		reportStatus('VOTES: ' + counts, true);
	}

	last_tally = {};
	last_exec_cmd = winner;

	return winner;
}


/* anarchy mode! */
function anarchy()
{
	if (Object.keys(last_tally).length === 0)
		return null;

	var users = [],
		commands = [];

	/* yes we actually need to do this */
	for (var user in last_tally) {
		users.push(user);
		commands.push(last_tally[user]);
	}


	var i, j, usr_tmp, cmd_tmp;

	/* http://en.wikipedia.org/wiki/Fisher-Yates_shuffle#The_modern_algorithm */
	for (i = users.length -1; i > 0; i--) {
		j = Math.floor(Math.random() * (i + 1));

		usr_tmp = users[i];
		cmd_tmp = commands[i];

		users[i] = users[j];
		commands[i] = commands[j];

		users[j] = usr_tmp;
		commands[j] = cmd_tmp; 
	}

	reportStatus('Winning command [' + users[0] + ']: ' + commands[0], true);

	last_tally = {};
	last_exec_cmd = commands[0];

	return commands[0];
}


/* elects a monarch given a user array */
function elect_monarch(users)
{
	if (users.length === 0)
		return 'MONARCH_NENOUGH';

	if (users.length == 1)
		return users[0];

	var i, j, usr_tmp;

	for (i = users.length -1; i > 0; i--) {
		j = Math.floor(Math.random() * (i + 1));

		usr_tmp = users[i];
		users[i] = users[j];
		users[j] = usr_tmp; 
	}

	return users[0];
}


/* fascist mode */
function monarchy()
{
	var users = [],
		commands = [],
		users_length = 1;

	/* yes we actually need to do this */
	for (var user in last_tally) {
		users.push(user);
		commands.push(last_tally[user]);
	}

	if (users.length !== 0)
		users_length = users.length;

	if (monarch !== null) {
		for (var i in commands) {
			switch (commands[i]) {
			case 'rebel':
				if (rebels < max_rebels)
					influence -= rebel_value;
				rebels += 1;
				break;
			case 'support':
				if (users[i] != monarch) {
					if (supports < max_supports)
						influence += support_value;
					supports += 1;
				}
				break;
			default:
				break;
			}
		}


		if (influence <= 0) {
			last_tally = {};
			return 'MONARCH_REELECTION';
		} else {
			if (last_tally[monarch]) {
				influence -= 10;
				monarch_cmd = last_tally[monarch];
				idle_penalty = 10;
				last_tally = {};

				return 'MONARCH_CMD';
			}

			influence -= idle_penalty;
			idle_penalty = idle_penalty * 2;
			last_tally = {};

			return 'MONARCH_IDLE';
		}
	} else {
		monarch = elect_monarch(users);
		influence = 100;
		rebels = 0;
		supports = 0;
		idle_penalty = 10;
		last_tally = {};

		return ((monarch == 'MONARCH_NENOUGH') ? monarch : 'MONARCH_NEW');
	}
}


/* chaos mode */
function chaos()
{
	var last_8_execs = [];

	for (var user in last_tally) {
		if (exports.map[last_tally[user]].indexOf("VOTE") === 0) {
			reportStatus('Voting on command (yes to run, nop not to run): ' + last_tally[user], true);

			voting_command = last_tally[user];
			last_tally = {};

			return 'CHAOS_VOTING';
		} else if (last_tally[user] == 'change_mode' && mode_can_change) {
			str_modes = '[';

			for (var i = 0; i < modes.length; i++)
				str_modes += modes[i] + ',';

			str_modes = str_modes.substring(0, str_modes.length - 1) + ']';
			reportStatus('Voting to change mode. Available modes: ' + str_modes, true);

			voting_mode = 'change_mode';
			last_tally = {};

			return 'CHAOS_VOTING';
		}

		handle_filter(last_tally[user]);
		
		console.log('Sending to qemu: ' + exports.map[last_tally[user]]);
		pub.send(['qemu-manager', exports.map[last_tally[user]]]);


		if (last_tally[user].indexOf('_double') != -1) {
			console.log('Sending to qemu: ' + exports.map[last_tally[user]]);
			pub.send(['qemu-manager', exports.map[last_tally[user]]]);
		}

		last_8_execs.push(last_tally[user]);

		if (last_8_execs.length == 8) {
			var out = '[';

			for (var y = 0; y < last_8_execs.length; y++)
				out += last_8_execs[y] + ',';

			out = out.substring(0, out.length - 1) + ']';
			last_8_execs = [];

			reportStatus('Run for your lives. Last 8 executed commands: ' + out, true);
		}
	}

	last_tally = {};

	return null;
}


/* attempts to move the mouse if the command is correct */
function mouse_movement(command)
{
	if (isNaN(command)) {
		reportStatus('Invalid issued command [' + command + '] for mouse movement.', true);
	} else {
		var qemu_cmd = 'mouse_move ',
			int_cmd = Math.round(parseInt(command));

		switch (mouse_vote) {
		case 'x':
			qemu_cmd += int_cmd + ' 0';
			mouse_x += int_cmd;

			if (mouse_x < mouse_range.min)
				mouse_x = mouse_range.min;
			else if (mouse_x > mouse_range.max)
				mouse_x = mouse_range.max;

			break;
		case 'y':
			qemu_cmd += '0 ' + int_cmd;
			mouse_y += int_cmd;

			if (mouse_y < mouse_range.min)
				mouse_y = mouse_range.min;
			else if (mouse_y > mouse_range.max)
				mouse_y = mouse_range.max;

			break;
		case 'z':
			qemu_cmd += '0 0 ' + int_cmd;
			mouse_z += int_cmd;

			if (mouse_z < mouse_range.min)
				mouse_z = mouse_range.min;
			else if (mouse_z > mouse_range.max)
				mouse_z = mouse_range.max;

			break;
		default:
			break;
		}

		reportStatus('New mouse coordinates: [dx: ' + mouse_x + '], [dy: ' + mouse_y +
			'], [dz: ' + mouse_z + '].', true);

		console.log('Sending to qemu: ' + qemu_cmd);
		pub.send(['qemu-manager', qemu_cmd]);

	}

	mouse_vote = null;
}


/* handles voting command result */
function voting_cmd_handle(selected_command)
{
	if (selected_command == 'yes') {
		reportStatus('Vote succeeded: ' + voting_command, true);

		// clearing the mouse coords
		if (last_exec_cmd.indexOf('boot') != -1 || last_exec_cmd == 'system_reset') {
			mouse_x = 0;
			mouse_y = 0;
			mouse_z = 0;
		}

		// send
		var command_qemu = exports.map[voting_command].replace(/^VOTE /, '');
		console.log('Sending to qemu: ' + command_qemu);
		pub.send(['qemu-manager', command_qemu]);
	} else {
		reportStatus('Vote failed: ' + voting_command, true);
	}

	voting_command = null;
}


/* handles voting mode result */
function voting_mode_handle(selected_command)
{
	if (command_mode != selected_command) {
		if (command_mode == 'monarchy')
			monarch = null;

		command_mode = selected_command;
		reportStatus('Mode changed successfully to [' + command_mode + '].', true);
	} else {
		reportStatus('It would be pointless to make the mode what it already is. Vote failed.', true);
	}

	voting_mode = null;
}


/* recursive command processing backbone */
function processCommand()
{
	command_interval = randomInt(8,20);
	var next_ms = command_interval * 1000;

	if (command_mode == 'anarchy' && !voting_command) {
		// smudges timer by random amounts. last # is smudge factor
		next_ms += Math.round((Math.random() - 0.5) * 2 * next_ms * 0.3);
	}
  
	setTimeout(processCommand, next_ms);
  
	var selected_command;

	if (voting_command !== null || mouse_vote !== null || voting_mode !== null) {
		selected_command = democracy_related();
	} else {
		switch (command_mode) {
		case 'democracy':
			selected_command = democracy_related();
			break;
		case 'demorchy':
			selected_command = democracy_related();
			break;
		case 'anarchy':
			selected_command = anarchy();
			break;
		case 'monarchy':
			selected_command = monarchy();
			break;
		case 'chaos':
			selected_command = chaos();
			break;
		default:
			break;
		}
	}


	if (command_mode == 'chaos') {
		if (selected_command === null)
			reportStatus(chaos_quotes[randomInt(0, chaos_quotes.length - 1)], true);

		else if (selected_command != 'CHAOS_VOTING') {
			if (voting_command !== null) {
				voting_cmd_handle(selected_command);
			} else if (voting_mode !== null) {
				voting_mode_handle(selected_command);
			}
		}
	} else if (monarch && selected_command) {
		if (mouse_vote !== null) {
			mouse_movement(selected_command);
		} else if (voting_mode !== null) {
			voting_mode_handle(selected_command);
		} else {
			switch (selected_command) {
			case 'MONARCH_NENOUGH':
				reportStatus('Not enough users to pick a monarch from.', true);
				monarch = null;
				break;
			case 'MONARCH_REELECTION':
				reportStatus('[' + monarch + '] has been overthrown. Electing a new monarch.. Type [elect_me].', true);
				monarch = null;
				break;
			case 'MONARCH_IDLE':
				reportStatus('The monarch [' + monarch + '] is idle and thus has suffered a penalty of ' +
					idle_penalty/2 + '. Current influence: ' + influence, true);
				break;
			case 'MONARCH_NEW':
				reportStatus('A new monarch has been elected [' + monarch + ']. Current influence: ' +
					influence, true);
				break;
			case 'MONARCH_CMD':
				if (monarch_cmd.indexOf('mouse_move') != -1) {
					mouse_vote = selected_command[selected_command.length -1];
					reportStatus('Monarch wants to move the mouse [d' + mouse_vote + ']. Integers only.', true);
				} else if (monarch_cmd == 'change_mode' && mode_can_change) {
					voting_mode = 'change_mode';

					str_modes = '[';

					modes.forEach(function(mode) {
						str_modes += mode + ',';
					});

					str_modes = str_modes.substring(0, str_modes.length - 1) + ']';
					reportStatus('Monarch wants to change the mode. Vote for it. Available modes: ' + str_modes, true);
				} else {
					reportStatus('The monarch [' + monarch + '] has casted [' + monarch_cmd + ']. ' +
						'Current influence: ' + influence, true);

					handle_filter(monarch_cmd);

					console.log('Sending to qemu: ' + exports.map[monarch_cmd]);
					pub.send(['qemu-manager', exports.map[monarch_cmd]]);

					if (monarch_cmd.indexOf('_double') != -1) {
						console.log('Sending to qemu: ' + exports.map[monarch_cmd]);
						pub.send(['qemu-manager', exports.map[monarch_cmd]]);
					}
				}
				break;
			default:
				reportStatus('Something is wrong, and the dev should know this.', true);
				break;
			}
		}
	} else if (selected_command) {
		if (voting_command !== null) {
			// important command
			voting_cmd_handle(selected_command);

		} else if (mouse_vote !== null) {
			// we were voting for mouse coords
			mouse_movement(selected_command);

		} else if (voting_mode !== null) {
			// we were voting for a new mode
			voting_mode_handle(selected_command);

		} else if (selected_command == 'change_mode' && mode_can_change) {
			voting_mode = 'change_mode';

			str_modes = '[';

			modes.forEach(function(mode) {
				str_modes += mode + ',';
			});

			str_modes = str_modes.substring(0, str_modes.length - 1) + ']';
			reportStatus('Voting to change mode. Available modes: ' + str_modes, true);

		} else if (exports.map[selected_command].indexOf("VOTE") === 0) {
			// this command requires a vote
			reportStatus('Voting on command (yes to run, nop not to run): ' + selected_command, true);
			voting_command = selected_command;

		} else if (exports.map[selected_command] !== "") {
			if (selected_command.indexOf('mouse_move') != -1) {
				mouse_vote = selected_command[selected_command.length -1];

				reportStatus('Voting to move the mouse [d' + mouse_vote + ']. Integers only.', true);
			} else {
				// normal command
				handle_filter(selected_command);

				console.log('Sending to qemu: ' + exports.map[selected_command]);
				pub.send(['qemu-manager', exports.map[selected_command]]);

				if (selected_command.indexOf('_double') != -1) {
					console.log('Sending to qemu: ' + exports.map[selected_command]);
					pub.send(['qemu-manager', exports.map[selected_command]]);
				}

			}
		}
	} else if (last_exec_cmd != 'yes' && last_exec_cmd != 'nop') {
		reportStatus('Not enough votes.', true);

		mouse_vote     = null;
		voting_command = null;
	}
}




/* =======================================
 * =============== main ==================
 * =======================================
 */
function main()
{
	process.stdin.resume();
	process.stdin.on('data', function(data) {
		process.stdout.write('Control: ' + data);
		var args = data.toString().split(' ');

		switch(args[0].trim()) {
		case 'map_load':
			exports.map_load();
			break;
		case 'reset_voting':
			// for when this inevitably breaks
			voting_command = null;
			break;
		case 'mode_can_change':
			mode_can_change = true;
			break;
		case 'mode_cant_change':
			mode_can_change = false;
			break;

		case 'anarchy':
			command_mode = 'anarchy';
			last_tally = {};
			reportStatus('ANARCHY is now in effect!', true);
			break;
		case 'democracy':
			command_mode = 'democracy';
			last_tally = {};
			reportStatus('DEMOCRACY is now in effect!', true);
			break;
		case 'demorchy':
			command_mode = 'demorchy';
			last_tally = {};
			reportStatus('DEMORCHY is now in effect!', true);
			break;
		case 'monarchy':
			command_mode = 'monarchy';
			last_tally = {};
			reportStatus('MONARCHY is now in effect!', true);
			break;
		case 'chaos':
			command_mode = 'chaos';
			last_tally = {};
			reportStatus('CHAOS. RUN.', true);
			break;


		case 'set_interval':
			var new_interval = +args[1];

			if (new_interval >= 1) {
				command_interval = new_interval;
				reportStatus('VOTING INTERVAL is now ' + new_interval + ' seconds.', false);
			} else {
				console.log('Trouble parsing command interval seconds, try again..');
			}
			break;
      
		default:
			console.log('Sending...', args);
			pub.send(args);
			break;
		}
	});

	exports.map_load();

	twitch_group.connect(0, function() {
		console.log('Twitch-group connected!');
	});
	twitch_chat.connect(0, function() {
		console.log('Twitch connected!');
	});

	twitch_group.send('CAP REQ', 'twitch.tv/commands');
	twitch_group.addListener('raw', function(message) {
		var valid_op = false;

		for (var i in ops)
			if (ops[i] === message.nick)
				valid_op = true;

		if (message.command === 'WHISPER' && valid_op) {
			if (message.args.length === 2) {
				var cmd;

				if (message.args[1].indexOf('obey_one') === 0) {
					cmd = message.args[1].substring(9, message.args[1].length);

					pub.send(['qemu-manager', exports.map[cmd]]);

					twitch_group.say(grp_chan, '/w ' + message.nick + ' You have casted [' +
						exports.map[cmd] + '] successfully.');

				} else if (message.args[1].indexOf('obey_all') === 0) {
					cmd = message.args[1].substring(9, message.args[1].length);

					for (var y in cmd)
						pub.send(['qemu-manager', exports.map[cmd[y]]]);

					twitch_group.say(grp_chan, '/w ' + message.nick + ' You have casted multi [' +
						cmd + '] successfully.');
				}
			}
		}
	});

	twitch_chat.addListener('message#' + config.nick, function(from, msg) {
		console.log(from + ': ' + msg);

		var blacklisted = false;

		for (var i in blacklist) {
			if (from.indexOf(blacklist[i]) != -1) {
				blacklisted = true;
				break;
			}
		}

		if (!blacklisted) {
			if (mouse_vote) {
				if (!isNaN(msg)) {
					console.log(from + ': ' + msg + ' -> ' + msg);
					pub.send(['client-console', '> ' + from + ': ' + msg]);

					last_tally[from.trim()] = msg;
				}
			} else if (voting_command) {
				if (msg == 'yes' || msg == 'nop')
					last_tally[from.trim()] = msg;
			} else if (voting_mode) {
				for (var i in modes) { /* jshint ignore:line */
					if (modes[i] == msg) {
						last_tally[from.trim()] = msg;
						break;
					}
				}
			} else if (exports.map[msg] !== null) {
				console.log(from + ': ' + msg + ' -> ' + exports.map[msg]);
				pub.send(['client-console', '> ' + from + ': ' + msg]);

				last_tally[from.trim()] = msg;
			}

		}
	});

	// set the first voting timer, initiating the recursion
	setTimeout(processCommand, command_interval * 1000);
}


/* fly ye bstrds */
setInterval(load_blacklist, reload_cd);
setInterval(load_filters, reload_cd);
setInterval(load_ops, reload_cd);
main();
