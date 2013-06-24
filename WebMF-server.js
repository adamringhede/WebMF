var io = require('socket.io').listen(8083);

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
 * (this is not ever used on the front end at this time)
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
function Match(specs){
	this.players = [];
	this.host = null;
	this.maxSize = specs ? specs.max : 5;
	this.state = {};
	this.whosTurn = 0;
	this.closed = false;
	this._onChange = function(){};
//	this._onStateChange = function(){};
}
/* Change the state of the match. 
 * @param path = "position/playerId"
 * @param obj = {x:32, y:12}
 */
Match.prototype.changeState = function(path, obj){
	var pathSteps =  path.split('/');
	var stateObjectReference = this.state;
	for(var i = 0; i < pathSteps.length; i++){
		if(stateObjectReference[pathSteps[i]] === null || stateObjectReference[pathSteps[i]] === undefined){
			stateObjectReference[pathSteps[i]] = {};
		}
		if(pathSteps[i] !== null){
            if(i === 0){
				if(pathSteps.length === 1){
					stateObjectReference[pathSteps[i]] = obj;
				} else {
					stateObjectReference = this.state[pathSteps[i]];
				}
            } else {
				if(i === pathSteps.length-1){
					stateObjectReference[pathSteps[i]] = obj;
					break;
				} else {
                	stateObjectReference = stateObjectReference[pathSteps[i]];
				}
            }

		}
	}
	this.onStateChange(path, obj);
};
Match.prototype.onStateChange = function(path, obj){
	//this._onStateChange = f;
	for(var i = 0; i < this.players.length; i++){
		// It might be better if this uses volatile,
		// since it is just a notification.
		this.players[i].socket.emit('stateChanged', {path:path,obj:obj});
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
	this.players.push(player);
	player.inmatch = true;
	if(this.players.length === 0){
		this.host = player;
	}
	this.change();
};
/* Remove a player with said id
 */
Match.prototype.removePlayer = function(playerId){
	// If the host is about to get removed
	for(var i = 0; i < this.players.length; i++){
		if(this.players[i] === null){
			this.players.splice(i,1);
			continue;
		}
		if(this.players[i].socket.id === playerId){
			this.players.splice(i,1);
			this.change();
			
			if(this.host.socket.id === playerId){
				this.reselectHost();
			}
			return true;
		}
	}
	// Was not able to remove player
	return false; 
};
Match.prototype.reselectHost = function(playerId){
	for(var i = 0; i < this.players.length; i++){
		// If none is specified; first possible player will be selected. 
		if(!player) {
			// If this is a player object and it is not the current host. 
			if(this.players[i] instanceof Player && this.players[i].socket.id !== this.host.socket.id){
				this.host = this.players[i];
				return true;
			}
		} else {
			if(this.players[i].socket.id = playerId){
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

function MatchMaster(){
	this.playerQueue = [];
	this.matches = [];
	this.addMatch();
	this.addMatch();
	this.addMatch();
	var self = this;
	this.coordinatorInterval = setInterval(function(){
		self.putPlayersInMatches();
	}, 5000);
}
MatchMaster.prototype.putPlayersInMatches = function(){
	if(this.playerQueue.length !== 0){
		var self = this;
		this.findOpenMatch(function(match, matchNumber){
			// Found an open match
			var player = self.playerQueue.shift();
			var players = [];
			for(var i = 0; i < match.players.length; i++) {
				players.push(match.players[i].info());
			}
			match.addPlayer(player);
			player.socket.emit('match found', {match:matchNumber, players:players, state:match.state, host:match.host});
			match.playerJoined(player);
			player.socket.set('currentMatchNumber', matchNumber);
		}, self.playerQueue[0].matchFilters, self.playerQueue[0]);
	}
}
MatchMaster.prototype.addMatch = function(specifications){
	this.matches.push(new Match(specifications)); // add change handler here
}
MatchMaster.prototype.getMatch = function(matchNumber){
	return this.matches[matchNumber];
}
MatchMaster.prototype.removeMatch = function(matchNumber){
	//this.matches.splice(matchNumber,1); // This would change the everything
	this.matches[matchNumber] = null;
}
MatchMaster.prototype.findOpenMatch = function(handler, filters, player){
	var emptySlots = 0;
	for(var i = 0; i < this.matches.length; i++){
		if(!this.matches[i]) {
			// This is an empty slot.
			this.matches[i] = new Match(filters);
			emptySlots += 1;
		}
		if(this.matches[i] instanceof Match){
			if(this.matches[i].players.length < this.matches[i].maxSize // Atleast one open spot
				&& !this.matches[i].closed // The match is not closed
				&& this.matches[i].maxSize === filters.max
				&& this.matches[i].players.length >= filters.min ){
				// Match has correct specifications and has a open spot
				if(handler) handler(this.matches[i], i);
				return true;
			}
		}
	}
	// Did not find a match. 
	if(emptySlots === 0 && filters.min === 0){
		// Create a new
		console.log("Creating a new match.");
		this.addMatch(filters);
		return;
	}
	// 
	
	// Move the player further back in the queue if no match was found to allow for new players to matchmake.
	player.attempts += 1;
	var pl = this.playerQueue.shift();
	var poweredPos, queuePos;
	// The new position is 2 to the power of the number of attempts the user has made.
	// If this exceeds the length of the queue, the new position will be at the end of the queue. 
	if((poweredPos = Math.pow(2,player.attempts)) > this.playerQueue.length) {
		queuePos = poweredPos;
	} else {
		queuePos = this.playerQueue.length;
	}
	this.playerQueue.splice(queuePos, 0, pl);
	
	return false;
}
MatchMaster.prototype.addPlayerToQueue = function(player){
	if(!player instanceof Player) return false;
	player.socket.emit('matchmaking queue');
	this.playerQueue.push(player);
	this.putPlayersInMatches();
}

var matchMaster = new MatchMaster();

var game = io.of('/game').on('connection', function (socket) {
	socket.on('set nickname', function (playerName) {
		socket.set('nickname', new Player(playerName, socket), function () {
			socket.emit('name set', socket.id);
		});
	});
	socket.on('matchmake', function(matchFilters){
		socket.get('nickname', function(err, player){
			player.matchFilters = {
				max: matchFilters.max,
				min: matchFilters.min
			};
			matchMaster.addPlayerToQueue(player);
		});
	});
	socket.on('disconnect', function(){
		socket.get('nickname', function(err, player){
			var match;
			var players;
			if(!player.inmatch) return;
			
			// If the player is in a match
			socket.get('currentMatchNumber', function(err, num){
				match = matchMaster.getMatch(num);
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
					matchMaster.removeMatch(num);
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
				socket.get('nickname', function(err,player){
					for(var i = 0; i < match.players.length; i++){
						if(match.players[i].socket.id !== socket.id){
							match.players[i].socket.emit(type, data);
						}
					}
				});
			});
		});
	});
	socket.on('leaveMatch', function(id){
		socket.get('currentMatchNumber', function(err, num){
			var match = matchMaster.getMatch(num);
			socket.get('nickname', function(err,player){
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
			});
		});
	});
	socket.on('updateState', function(data){
		socket.get('currentMatchNumber', function(err, num){
			var match = matchMaster.getMatch(num);
			match.changeState(data.path, data.obj);
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
			matchMaster.getMatch(num).closed = false;
		});
	});
	socket.on('closeMatch', function(){
		socket.get('currentMatchNumber', function(err, num){
			matchMaster.getMatch(num).closed = true;
		});
	});
	socket.on('changeTurn', function(){
		socket.get('currentMatchNumber', function(err, num){
			var match = matchMaster.getMatch(num);
			match.whosTurn += 1;
			if(match.whosTurn === match.players.length){
				match.whosTurn = 0;
			}
			var player = match.players[match.whosTurn].info();
			for(var i = 0; i < match.players.length; i++){
				match.players[i].socket.emit('turnChanged', player);
			}
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
			var match = matchMaster.getMatch(num);
			// Remove the kicked player from the match.
			match.removePlayer(playerId);
			// Notify players
			for(var i = 0; i < match.players.length; i++){
				// Notify other players
				if(match.players[i].socket.id !== playerId){
					match.players[i].socket.emit('playerLeft', {
						playerId: socket.id,
						name: player.name
					});
				// Notify the kicked player
				} else {
					match.players[i].socket.emit('gotKicked');
				}
			}
		});
	});
});