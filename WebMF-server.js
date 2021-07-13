/*

Copyright 2013 Adam David Ringhede

   You may not modify and/or redistribute this software
   under another name. You will neither take credit for 
   the algorithms and code used to make WebMF. 

*/



var socketio = require('socket.io'),
	fs = require('fs'),
	mongo = require('mongoskin'),
	_ = require('lodash'),
	io = socketio.listen(process.env['PORT'] || 8083,  {'transports': ['websocket', 'polling']}),
	db = mongo.db('localhost:27017/WebMF', {safe:true}),
	BSON = mongo.BSONPure;
const yargs = require('yargs');
const uuid = require("uuid");
	
// Used to creat IDs for mongoDB
function objectId(theidID){
	return new BSON.ObjectID(theidID);
}
db.bind('match');


function polyfillSocket(socket) {
	const data = {};
	socket.set = function (key, value, callback) {
		data[key] = value;
		if (callback) {
			callback();
		}
	}
	socket.get = function (key, callback) { // callback(err, value)
		if (data[key]) {
			callback(null, data[key])
		} else {
			callback(new Error("Key is not set"), null)
		}
	}
}


function Player(playerName, sock){
	this.name = playerName || "";
	this.inmatch = false;
	this.socket = sock;
	this.attempts = 0;
	this.matchFilters = {
		max:99999,
		min:0
	};
}
/* Sends a message to the player with some data from the server. 
 * (this is not ever used on the front end at this time)4
 */
Player.prototype.send = function(data){
	this.socket.emit('message', data);
};
/* Sumarize information about the player
 */
Player.prototype.info = function(){
	return {
		id:this.socket.id,
		name:this.name
	};
};


/* specs = {max:int, min:int}
 */
function Match(specs, id = uuid.v4()){
	this.players = [];
	this.type = specs ? ( specs.type || "" ) : "";
	this.host = null;
	this.minSize = specs ? specs.min : 0;
	this.maxSize = specs ? specs.max : 5;
	this.state = {};
	this.persistent = specs ? (specs.persistent ? specs.persistent : false) : false;
	this.id = id || "";
	this.customSpecs = specs ? specs.customFilters || {} : {};
	this.whosTurn = ""; // SHOULD BE A PLAYER ID
	this.closed = false;
	this.startedAt = new Date().getTime();
	this.timeElapsed = 0; // A clock that should be used by all clients to not rely on wall time. 
	this.locks = {};
	this.queues = {};
	this._onChange = function(){};
	this.playerLeft = function(){};
	this.onOpen = function(){};
	this.reselectHost();
	var self = this;
	this.clockUpdateInterval = setInterval(() => {
		// When a player joins, they need to know the current elapsed time. 
		this.timeElapsed = (new Date().getTime() - this.startedAt) / 1000;
		for(var i = 0; i < this.players.length; i++){
			this.players[i].socket.emit('timeElapsed', this.timeElapsed);
		}
	}, 5000);
	if(this.persistent){ 
		if(this.id !== ""){
			// Grab existing match from DB
			db.match.findOne({_id:objectId(this.id)}, function(err, foundMatch){
				self.whosTurn = foundMatch.whosTurn;
				self.persistent = foundMatch.spec.persistent;
				self.customSpecs = foundMatch.spec.customFilters;
				self.maxSize = foundMatch.spec.max;
				self.minSize = foundMatch.spec.min;
				self.type = foundMatch.spec.type;
			});
		} else {
			// This is a new persistent match so create a new document
			db.match.insert({
					spec: specs,
					state:{}, 
					whosTurn:self.whosTurn,
					created: new Date()
				}, function(err, result){
				console.log(result);
				self.id = result._id;
			});
		}
	}
}
/* Change the state of the match. 
 * @param path = "position/playerId"
 * @param obj = {x:32, y:12}
 */
Match.prototype.changeState = function(path, obj){
	var pathSteps =  path.split('/');
	const end = pathSteps.slice(0,-1).reduce((state, step) => {
        if (!state[step]) {
            state[step] = {};
        }
        return state[step];
    }, this.state)
    end[pathSteps[pathSteps.length-1]] = obj;
	this.onStateChange(path, obj);
};
Match.prototype.onStateChange = function(path, obj){
	for(var i = 0; i < this.players.length; i++){
			this.players[i].socket.emit('stateChanged', {path:path,obj:obj});
		}
		this.change();
		if(this.persistent && this.id !== ""){
			db.match.update({_id:objectId(this.id)}, {$set: {'state': this.state}}, function(err, handler){
				if(err){
					console.log("Error when trying to update match state in database");
				}
			});
		}
};
Match.prototype.getState = function(path){
	if(!path) return this.state;
	var pathSteps =  path.split('/');
	var stateObjectReference = this.state;
	for(var i = 0; i < pathSteps.length; i++){
		// Return the last element if the other one does not exist. 
		if(stateObjectReference[pathSteps[i]] === null || stateObjectReference[pathSteps[i]] === undefined){
			return stateObjectReference;
		}
		if(pathSteps[i] !== null){
            if(i === 0){
				if(pathSteps.length === 1){
					return stateObjectReference[pathSteps[i]]
				//	stateObjectReference[pathSteps[i]] = obj;
				} else {
					stateObjectReference = this.state[pathSteps[i]];
				}
            } else {
				if(i === pathSteps.length-1){
					return stateObjectReference[pathSteps[i]];
					break;
				} else {
                	stateObjectReference = stateObjectReference[pathSteps[i]];
				}
            }

		}
	}
};
/* Add a player to the match.
 * player instance of MPPlayer
 */
Match.prototype.addPlayer = function(player){
	if (player == null) throw new Error("Can not add null as player");
	const alreadyAdded = this.players.some(p => p.id == player.id && p.socket.id == player.socket.id)
	if (alreadyAdded) {
		return
	}
	this.players.push(player)
	this.change();
	player.inmatch = true;
	if(this.players.length === 1){
		this.host = player;
	}
	if (this.players.length === this.minSize){
		for(var i = 0, l = this.players.length; i < l; i++){
			this.players[i].socket.emit('minReached');
		}
	}
	
	if (this.type === "TurnBased") {
		// If it is a new match, whosTurn need to be set. 
		if(this.whosTurn === "") {
			this.whosTurn = player.socket.id;
			for(var i = 0; i < this.players.length; i++){
				this.players[i].socket.emit('turnChanged', this.whosTurn);
				this.turnChanged();
			}
		}
	}
	
	// Notify other players
	this.playerJoined(player);
};
Match.prototype.changeTurn = function(specifiedPlayer){
	if (this.players.length <= 1) {
		return;
	} 
	if (!specifiedPlayer) {
		var current;
		for (current = 0; current < this.players.length; current++) {
			if (this.players[current].socket.id === this.whosTurn) {
				break;
			}
		}
		this.whosTurn = this.players[(current+1) % this.players.length].socket.id;
	} else {
		this.whosTurn = specifiedPlayer;
	}
	/*
	var playerId = "";
	for (var i = 0; i < this.players.length; i++) {
		if(this.players[i].socket.id === this.whosTurn){
			playerId = this.players[i].socket.id;
		}
	}*/

	for (var i = 0; i < this.players.length; i++) {
		this.players[i].socket.emit('turnChanged', this.whosTurn);
	}
	this.turnChanged();
};
Match.prototype.turnChanged = function(){
	if(this.persistent && this.id !== ""){
		db.match.update({_id:objectId(this.id)}, {$set: {'whosTurn': this.whosTurn}}, function(err, handler){
			if(err){
				console.log("Error when trying to update match whosTurn in database");
			}
		});
	}
};
/* Remove a player with said id
 */
Match.prototype.removePlayer = function(playerId){
	// If the host is about to get removed
	for(var i = 0; i < this.players.length; i++){
		if(this.players[i] === null){
			this.players.splice(i,1);
		//	continue; // Should probably not do this because of risk of skipping the next one
		}
		if(this.players[i].socket.id === playerId){
			this.players[i].inmatch = false;
			this.players.splice(i,1);
			//this.change();
			this.playerLeft();
			if(this.host.socket.id === playerId){
				this.reselectHost();
			}
			if (this.players.length < this.minSize){
				for(var i = 0, l = this.players.length; i < l; i++){
					this.players[i].emit('lessThanMin');
				}
			}
			return true;
		}
	}
	// Was not able to remove player
	return false; 
};
Match.prototype.reselectHost = function(playerId){
	if(this.players.length === 1) {
		this.host = this.players[0];
		return;
	}
	for(var i = 0; i < this.players.length; i++){
		// If none is specified; first possible player will be selected. 
		if(!playerId) {
			// If this is a player object and it is not the current host. 
			if(this.players[i] instanceof Player && this.players[i].socket.id !== this.host.socket.id){
				this.host = this.players[i];
				return true;
			}
		} else {
			if(this.players[i].socket.id === playerId){
				this.host = this.players[i];
				return true;
			}
		}
	}
	// Notify players about the reselection of host.
	for(var i = 0; i < this.players.length; i++){
		this.players[i].socket.emit("hostChanged", this.host.info);
	}
};
/* Trigger the send event
 */
Match.prototype.change = function(handler){
	if(handler) this._onChange = handler;
	else this._onChange();
};
Match.prototype.broadcast = function(from, data){
	for(var i = 0; i < this.players.length; i++){
		if(this.players[i] === null) continue;
	//	if(from === null) continue;
		if(this.players[i].socket.id === from.socket.id) continue;
		this.players[i].socket.emit('recieve', {
			message: data,
			from: from.socket.id
		});
	}
};
Match.prototype.emitToAll = function(key, data) {
	for(var i = 0; i < this.players.length; i++){
		if(this.players[i] == null) continue;
		this.players[i].socket.emit(key, data);
	}
}
Match.prototype.pushToQueue = function(queueName, entry) {
	if (!this.queues[queueName]) this.queues[queueName] = [];
	this.queues[queueName].push(entry)
	// This might create a lot of messages. However, hopefully, this will still provide some synchronization.
	// A character may perform 1 action per second on average so in a 3v3 we will have 6 messages per second on average. Possibly up to 18 per second
	this.emitToAll('queueUpdate.' + queueName, entry)
}
Match.prototype.playerJoined = function(from){
	for(var i = 0; i < this.players.length; i++){
		if(this.players[i] === null) continue;
		if(this.players[i].socket.id === from.socket.id) continue;
		this.players[i].socket.emit('playerJoined', {
			id: from.socket.id,
			name: from.name
		});
	}
};
Match.prototype.kickPlayer = function(playerId){
	// Remove the kicked player from the match.
	this.removePlayer(playerId);
	// Notify players
	for(var i = 0; i < this.players.length; i++){
		// Notify other players
		if(this.players[i].socket.id !== playerId){
			this.players[i].socket.emit('playerLeft', {
				playerId: socket.id,
				name: player.name
			});
		// Notify the kicked player
		} else {
			this.players[i].socket.emit('gotKicked');
		}
	}
};
Match.prototype.open = function(){
	this.closed = false;
	this.onOpen();
};
/**
 * Set a lock for a specified key 
 * @param {string} key 
 */
Match.prototype.acquireLock = function (key) {
	if (this.locks[key]) {
		return false;
	}
	this.locks[key] = true;
	setTimeout(() => {
		this.locks[key] = false;
	}, 10000);
	return true;
};
Match.prototype.releaseLock = function (key) {
	delete this.locks[key];
}

function MatchMaster(gameName){
	this._onChanged = function(){};
	this._onQueueChanged = function(){};
	this.belongsToGame = gameName || "";
	this.playerQueue = [];
	this.matches = [];
	this.addMatch();
	this.addMatch();
}
MatchMaster.prototype.putPlayersInMatches = function(){ 
	if(this.playerQueue.length > 0){
		var self = this;
		var player = self.playerQueue.shift();
		const foundMatch = this.findOpenMatch(function(match, matchNumber, persistentID){
			// Found an open match
			var players = [];
			match.addPlayer(player);
			for(var i = 0; i < match.players.length; i++) {
				players.push(match.players[i].info());
			}
			self.queueChanged();
			player.socket.emit('match found', {
				match: matchNumber, 
				id: persistentID, 
				players: players, 
				state: match.state, 
				host: match.host.info(), 
				whosTurn: match.whosTurn
			});
			player.socket.set('currentMatchNumber', matchNumber);
			
			/* POSSIBLE IMPROVEMENT
			if(self.playerQueue > 0)
				self.putPlayersInMatches();
			*/ 
		}, player.matchFilters, player);
		if (!foundMatch) {
			self.playerQueue.push(player)
		}
	}
};
MatchMaster.prototype.addMatch = function(specifications, id){
	var nm = new Match(specifications, id),
		self = this;
	this.matches.push(nm);
	nm.playerLeft = function(){
		self.putPlayersInMatches();
	};
	nm.onOpen = function(){
		self.putPlayersInMatches();
	};
	//this.changed();
	return nm;
};
MatchMaster.prototype.getMatch = function(matchNumber){
	if(typeof matchNumber === 'number'){
		return this.matches[matchNumber];
	} else if (typeof matchNumber === 'string' && matchNumber !== ""){
		for(var i = 0, l = this.matches.length; i<l; i++){
			if(this.matches[i].id === matchNumber){
				return this.matches[i];
			}
		}
	}
};
MatchMaster.prototype.removeMatch = function(matchNumber, force){
	if(this.getMatch(matchNumber) && this.getMatch(matchNumber).players.length <= 0 || force === true){
		this.matches[matchNumber] = null;
		this.changed();
		return true;
	} else {
		return false;
	}
};
MatchMaster.prototype.changed = function(f){
	if(!f) this._onChanged(this.matches, this.belongsToGame);
	else this._onChanged = f;
};
MatchMaster.prototype.queueChanged = function(f){
	if(!f) this._onQueueChanged(this.playerQueue.length, this.belongsToGame);
	else this._onQueueChanged = f;
};
MatchMaster.prototype.removePlayerFromQueue = function(playerId){
	for(var i = 0; i < this.playerQueue.length; i++){
		if(this.playerQueue[i].socket.id === playerId){
			this.playerQueue.splice(i,1);
		//	this.queueChanged();
			return true;
		}
	}
	// Did not delete anybody
	return false;
}
MatchMaster.prototype.findOpenMatch = function(handler, filters, player){
	// TODO Change the matches structure to be an object instead of an array.
	// TODO Refactor this entire server.
	for(var i = 0; i < this.matches.length; i++){
		if(this.matches[i] instanceof Match){
			if(this.matches[i].players.length < this.matches[i].maxSize // Atleast one open spot
				&& !this.matches[i].closed // The match is not closed
				&& this.matches[i].maxSize === filters.max
				&& this.matches[i].type === filters.type
				&& this.matches[i].persistent === (filters.persistent || false) 
				&& this.matches[i].players.length >= (filters.min || 0) 
				&& _.where([this.matches[i].customSpecs], filters.customFilters).length > 0 ){
				// Match has correct specifications and has a open spot
				if(handler) {
					if(this.matches[i].id === "") handler(this.matches[i], i);
					else handler(this.matches[i], i, this.matches[i].id);
				}
				return true;
			}
		}
	}
	// Did not find a match. 
	if(filters.min === 0){
		console.log("Creating a new match.");
		var newMatch = this.addMatch(filters);
		if(handler) {
			if (newMatch.id === "") handler(newMatch, i); // This is a temporary match
			else handler(newMatch, i, newMatch.id); // This is a persistent match
		}
		return true;
	}
	// 
	
	// Move the player further back in the queue if no match was found to allow for new players to matchmake.
	player.attempts += 1;

	return false;
};
MatchMaster.prototype.addPlayerToQueue = function(player){
	if(!player instanceof Player) return false;
	player.socket.emit('matchmaking queue');
	this.playerQueue.push(player);
	this.queueChanged();
	this.putPlayersInMatches();
};
MatchMaster.prototype.addPlayerToMatch = function(player, matchNum){
	var match;
	function addToMatch(match, matchNum, player){
		if(match && match.players.length < match.maxSize) {
			match.addPlayer(player); 
			var players = [];
			for(var i = 0; i < match.players.length; i++) {
				players.push(match.players[i].info());
			}
			player.socket.emit('joinedMatch', {players:players, state:match.state, host:match.host.info(), whosTurn:match.whosTurn, type:match.type, timeElapsed: match.timeElapsed});
			match.playerJoined(player);
			player.socket.set('currentMatchNumber', matchNum);
		} else {
			player.socket.emit('couldNotAddToMatch', {matchNum: matchNum});
		}
	}
	var self = this;
	if(typeof matchNum === 'number'){
		// Add to an existing match
		match = this.getMatch(matchNum);
		addToMatch(match, matchNum, player);
	} else if (typeof matchNum === 'string') {
		// Add to a persistent match
		match = this.getMatch(matchNum);
		if(!match){
			// Match is not running
			db.match.findOne({_id:objectId(matchNum)}, function(err, foundMatch){
				if(err){
					console.log("Error: When trying to find a match");
					return;
				}
				// Create a new match with this state and add player
				if(foundMatch){
					match = self.addMatch(foundMatch.specs, matchNum); 
					match.state = foundMatch.state;
					match.persistent = true;
					addToMatch(match, matchNum, player);
				} else {
					// Did not find a match, should emit error
					player.socket.emit('couldNotAddToMatch', {matchNum: matchNum});
				}
			});
		} else {
			// Match is running
			addToMatch(match, matchNum, player);
		}
	}
	
};

function gameConnectionHandler(socket, matchMaster, hooks){
	polyfillSocket(socket)

	socket.on('set nickname', function (playerName) {
		socket.set('player', new Player(playerName, socket), function () {
			socket.emit('name set', socket.id);
		});
	});
	socket.on('matchmake', function(parameters){
		socket.get('player', function(err, player){
			player.matchFilters = {
				max: parameters.max,
				min: parameters.min,
				type: parameters.type,
				persistent: parameters.persistent,
				customFilters: parameters.customFilters
			};
			matchMaster.addPlayerToQueue(player);
		});
	});
	socket.on('disconnect', function(){
		socket.get('player', function(err, player){
			if (!player || !player.socket) return;
			console.log("player diconnected with id " + socket.id)
			var match;
			var players;
			// Incase the player is in the queue, remove the player.
			matchMaster.removePlayerFromQueue(player.socket.id);
			if(!player.inmatch) return;
			
			// If the player is in a match
			socket.get('currentMatchNumber', function(err, num){
				if(num === -1) return;
				match = matchMaster.getMatch(num);
				if (match == null) return;
				players = match.players;
				match.removePlayer(player.socket.id);
				// Broadcast disconnection message
				for(var i = 0; i < players.length; i++) {
					if(players[i] === null) continue;
					players[i].socket.emit('playerDisconnected', {
						message: "Disconnection: " + player.name + " disconnected.",
						from: {
							playerId: player.socket.id,
							name: player.name
						}
					});
				}
				// If the last player disconnected from the match
				if(players.length === 0) {
					// Remove match
					console.log("Removing match with number " + num)
					// This can cause issues if players are needing to reconnect.
					//matchMaster.removeMatch(num);
				}
			});
			
			
		});
	});
	socket.on('send', function(data){
		var match = matchMaster.matches[data.match];
		var players = match.players;
		if(data.reciever === "host") data.reciever = match.host.socket.id;
		for(var i = 0; i < players.length; i++){
			// If a reciever is set, skip the others
			if(data.reciever && players[i].socket.id !== data.reciever) continue;
			// Send to other players
			if(players[i].socket.id !== data.from){
				if(data.unreliable){
					players[i].socket.valatile.emit('recieve', {
						message: data.message,
						from: data.from
					});
				} else {
					players[i].socket.emit('recieve', {
						message: data.message,
						from: data.from
					});
				}
			}
		}
	});
	socket.on('disconnectMe', function(id){
		socket.disconnect();
	});
	socket.on('customEvent', function(type){
		socket.on(type, function(data){
			socket.get('currentMatchNumber', function(err, num){
				var match = matchMaster.getMatch(num);
				if (match == null) return;
				for(var i = 0; i < match.players.length; i++){
					if(match.players[i].socket.id !== socket.id){
						match.players[i].socket.emit(type, data);
					}
				}
			});
		});
	});
	socket.on('leaveMatch', function(id){
		socket.get('currentMatchNumber', function(err, num){
			var match = matchMaster.getMatch(num);
			if (!match) return;
			socket.get('player', function(err,player){
				for(var i = 0; i < match.players.length; i++){
					if(match.players[i].socket.id !== socket.id){
						match.players[i].socket.emit('playerLeft', {
							playerId: socket.id,
							name: player.name
						});
					}
				}
				match.removePlayer(socket.id);
				socket.set('currentMatchNumber', -1);
				if(match.players.length === 0) {
					// Remove match
					matchMaster.removeMatch(num);
				}
			});
		});
	});
	socket.on('updateState', function(data){
		socket.get('currentMatchNumber', function(err, num){
			var match = matchMaster.getMatch(num);
			if (match) {
				match.changeState(data.path, data.obj);
				if (hooks.onStateUpdate) {
					try {
						hooks.onStateUpdate(match.id, match.state)
					} catch (e) {
						console.error("Hooks error: " + e.message);
					}
				} else {
					console.warn("Hooks function missing: onStateUpdate(state)")
				}
				
			}
		});
	});
	socket.on('getState', function(data){
		socket.get('currentMatchNumber', function(err, num){
			var match = matchMaster.getMatch(num);
			socket.emit('gotState', match.getState(data.path));
		});
	});
	socket.on('openMatch', function(){
		socket.get('currentMatchNumber', function(err, num){
			matchMaster.getMatch(num).open();
		});
	});
	socket.on('closeMatch', function(){
		socket.get('currentMatchNumber', function(err, num){
			matchMaster.getMatch(num).closed = true;
		});
	});
	socket.on('changeTurn', function(specifiedPlayerId){
		socket.get('currentMatchNumber', function(err, num){
			matchMaster.getMatch(num).changeTurn(specifiedPlayerId || false);
		});
	});
	socket.on('getHost', function(){
		socket.get('currentMatchNumber', function(err, num){
			var match = matchMaster.getMatch(num);
			socket.emit('gotHost', match.host.info());
		});
	});
	socket.on('kickPlayer', function(playerId){
		socket.get('currentMatchNumber', function(err, num){
			matchMaster.getMatch(num).kickPlayer(playerId);
		});
	});
	socket.on('leaveQueue', function(playerId){
		matchMaster.removePlayerFromQueue(playerId);
	});
	socket.on('joinMatch', function(data){
		socket.get('player', function(err, player){
			if (!matchMaster.getMatch(data.matchNum)) {
				const match = new Match(null, data.matchNum);
				match.closed = true;
				matchMaster.matches.push(match)
			}
			matchMaster.addPlayerToMatch(player, data.matchNum);
		});
	});
	socket.on('acquireLock', function(data) {
		// data = {key: string}
		socket.get('currentMatchNumber', function(err, num){
			var match = matchMaster.getMatch(num);
			if (match) {
				var result = match.acquireLock(data.key)
				socket.emit('acquireLock.' + data.key, result)
				match.emitToAll('updatedLocks', match.locks)
			}
		});
	})
	socket.on('releaseLock', function(data) {
		// data = {key: string}
		socket.get('currentMatchNumber', function(err, num){
			var match = matchMaster.getMatch(num);
			if (match) {
				var result = match.releaseLock(data.key)
				match.emitToAll('updatedLocks', match.locks)
			}
		});
	})
	socket.on('putToQueue', function(data) {
		// data: { queue: string, entry: any }
		socket.get('currentMatchNumber', function(err, num){
			var match = matchMaster.getMatch(num);
			if (match) {
				match.pushToQueue(data.queue, data.entry)
			}
		});
	})
}

function loadHooks(path) {
	console.log("Using hooks from module at: " + path)
	return require(path);
}

(function(){
	const running = {};
	const argv = yargs
		.option('hooks', {
			description: 'A js file to handle events',
			type: 'string',
		})
		.option('games', {
			description: 'A list of games to use',
			type: 'string',
		})
		.help().alias('help', 'h')
		.argv;

	const hooks = loadHooks(argv.hooks != null ? argv.hooks : './hooks-default')
	const games = argv.games ? argv.games.split(',') : ['main']
	/*
	io.of('/administration').on('connection', function(socket){
		
		adminSockets.push(socket);
			
		setTimeout(function(){
		//	socket.emit('gotServerStates', running)
		}, 1000);
		socket.on('getConnectors', function(){
			socket.emit('gotConnectors', games);
		});
		socket.on('diconnect', function(){
			console.log("DISCONNECTED!");
			for(var i = 0; i < adminSockets.length; i++){
				if(socket.id === adminSockets[i]){
					adminSockets.splice(i,1);
			 	}
			}
		});
	});
	
	function broadcastAdmins(type, data){
		for(var i = 0; i < adminSockets.length; i++){
			try{
				adminSockets[i].emit(type || 'misc', data);
			}catch(e){}
		}
	}
	function pushServerStates(){
		broadcastAdmins('gotServerStates', running);
	}
	setInterval(pushServerStates, 7000);*/
	// Start games in config file
	for(var i = 0; i < games.length; i++){
		running[i] = (function(){
			console.log("Started: "+games[i]);
			/*
			broadcastAdmins('startedGameConnector', {
				name: games[i].name,
				index: i,
				max: games.length
			});
			*/
			var matchMaster = new MatchMaster(games[i]);
			setInterval(() => {
				matchMaster.putPlayersInMatches();
			}, 5000);

			/*
			matchMaster.changed(function(matches, gameName){
			//	broadcastAdmins('matchesChanged', {game:gameName, matches:matches});
				pushServerStates();
			});
			matchMaster.queueChanged(function(queue, gameName){
			//	broadcastAdmins('playerQueueChanged', {game:gameName, playerQueue:queue});
				pushServerStates()
			});*/
			io.of('/'+games[i]).on('connection', function(socket){
				gameConnectionHandler(socket, matchMaster, hooks);
			});
			return {
				game: games[i],
				matches: matchMaster.matches,
				playerQueue: matchMaster.playerQueue,
				running: true
			};
		})();	
	}
})();
