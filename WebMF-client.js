
function MPMatch(socket, matchnumber, players){
	this.socket = socket;
	this.timeStarted = (new Date()).getTime();
	this.matchNumber = matchnumber;
	this.players = new MPPlayerCollection();
	this.players.fill(players);
	this.state = {};
	this.host = null;
	this._onPlayerJoined = function(){};
	this._onPlayerDisconnect = function(){};
	this._onPlayerLeft = function(){};
	this._onStateChange = function(){};
	this._onRecieveMessage = function(){};
	this._notPartOfApi_onLeaveMatch = function(){};
	var self = this;
	this.socket.on('playerDisconnected', function(data){
		//console.log(data.message); 
		self._onPlayerDisconnect(data.from);
		self.players.remove(data.from);
	});
	this.socket.on('playerJoined', function(data){ 
		var newPlayer = new MPPlayer(data);
		self.players.add(newPlayer);
		self._onPlayerJoined(newPlayer);
	});
	this.socket.on('playerLeft', function(data){
		self.players.remove(data.playerId);
		self._onPlayerLeft(data);
	});
	this.socket.on('hostChanged', function(newHost){
		self.host = self.players.get(newHost.id);
	});
	this.socket.on('recieve', function(data){
		self._onRecieveMessage(data.message, data.from);
	});
	this.socket.on('stateChanged', function(data){
		var path = data.path,
			obj = data.obj;
		var pathSteps =  path.split('/');
		var stateObjectReference = self.state;
		for(var i = 0; i < pathSteps.length; i++){
			if(stateObjectReference[pathSteps[i]] === null || stateObjectReference[pathSteps[i]] === undefined){
				stateObjectReference[pathSteps[i]] = {};
			}
			if(pathSteps[i] !== null){
	            if(i === 0){
					if(pathSteps.length === 1){
						stateObjectReference[pathSteps[i]] = obj;
					} else {
						stateObjectReference = self.state[pathSteps[i]];
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
		self._onStateChange(data.path, data.obj);
	});
}
/* Return the player collection.
 */
MPMatch.prototype.players = function(){
	return this.players();
};
/* Set an eventhandler for when a player joins the match.
 * Callback takes one argument wich is the player of type MPPlayer.
 */
MPMatch.prototype.onPlayerJoined = function(f){
	this._onPlayerJoined = f;
};
/* Set an eventhandler for when a player disconnects.
 * Callback takes one argument wich is the player of type MPPlayer.
 */
MPMatch.prototype.onPlayerDisconnect = function(f){
	this._onPlayerDisconnect = f;
};
/* Set an eventhandler for when a player leaves the match.
 * Callback takes one argument wich is the player of type MPPlayer.
 */
MPMatch.prototype.onPlayerLeft = function(f){
	this._onPlayerLeft = f;
};
/* Set an eventhandler for when the local player gets kicked from the match.
 */
MPMatch.prototype.onGotKicked = function(f){
	this.socket.on('gotKicked', f);
	this._notPartOfApi_onLeaveMatch();
};
/* Send data to another player. 
 */
MPMatch.prototype.send = function(reciever, data, unreliable){
	if(!reciever instanceof MPPlayer) throw "Invalid reciever object";
	t((unreliabe || false) ? this.socket.volatile : this.socket).emit('send', {
		match: matchNumber,
		message: data,
		reciever: reciever.playerId,
		from: this.playerId,
		unreliable: unreliable || false
	});
};
/* Send data to every player in the match except for the local player.
 */
MPMatch.prototype.broadcast = function(data, unreliable){
	((unreliabe || false) ? this.socket.volatile : this.socket).emit('send', {
		match: matchNumber,
		message: data,
		reciever: false,
		from: this.playerId,
		unreliable: unreliable || false
	});
};
/* Handle recieved messages. 
 * callback will have arguments: (message, from);
 */
MPMatch.prototype.recieve = function(f){
	this._onRecieveMessage = f;
};
/* Leave the match
 */
MPMatch.prototype.leave = function(){
	this.socket.emit('leaveMatch');
	this._notPartOfApi_onLeaveMatch();
};
/* Bind an eventhandler to a custom event. This eventhandler will not be 
 * executed if the event was triggered on this MPMatch object. 
 */
MPMatch.prototype.bind = function(type, callback){
	this.socket.on(type, callback);
	this.socket.emit('customEvent', type);
};
/* Trigger and event and send out data. The player who triggers it, 
 * will not recieve a notification, even if the player has bound to it. 
 */
MPMatch.prototype.trigger = function(type, data, unreliable){
	((unreliabe || false) ? this.socket.volatile : this.socket).emit(type, data);
};
/* Update the centralized state using a path and an object.
 */ 
MPMatch.prototype.updateState = function(path, obj){
	this.socket.emit('updateState', {path:path, obj:obj});
};
MPMatch.prototype.onStateChanged = function(f){
	self._onStateChange = f;
};
/* Get the centralized state. You may use a path to only get a part of the state.
 * If the full path cannot be found, it will return the last possible object in the path. 
 */
MPMatch.prototype.getState = function(path, f){
	this.socket.emit('getState', {path:path});
	this.socket.on('gotState', function(state){
		if(!f) path(state);
		else f(state);
	});
};
/* Updates the local state with the centralized state.
 */
MPMatch.prototype.renewState = function(){
	var self = this;
	this.getState(function(state){
		self.state = state;
	});
};
MPMatch.prototype.close = function(){
	this.socket.emit('closeMatch');
};
MPMatch.prototype.open = function(){
	this.socket.emit('openMatch');
};
/* Kick a player from the match 
 */
MPMatch.prototype.kick = function(player){
	this.socket.emit('kickPlayer', (player instanceof MPPlayer) ? player.playerId : player);
};

function MPTurnBasedMatch(a,b,c){
	MPMatch.call(this, a, b, c);
}
MPTurnBasedMatch.prototype = Object.create(MPMatch.prototype);
MPTurnBasedMatch.prototype.constructor = MPTurnBasedMatch;

MPTurnBasedMatch.prototype.currentPlayer = null;
MPTurnBasedMatch.prototype.whosTurn = function(){
	return this.currentPlayer;
};
MPTurnBasedMatch.prototype.onTurnChanged = function(turnChanged){
	var self = this;
	this.socket.on('turnChanged', function(player){
		turnChanged(player);
		self.currentPlayer = self.players.get(player.playerId) // FIND PLAYER IN COLLECTION WITH NEW METHOD
	});
};
MPTurnBasedMatch.prototype.changeTurn = function(){
	this.socket.emit('changeTurn');
};

function MPSession(name, hostname, port){
	this.localPlayerId = "";
	this.localPlayerName = name || "";
	this.matchInProgress = false;
	this._putOnMatchmakingQueue = function(){};
	this._onMatchFound = function(){};
	this._onConnect = function(){};
	this._onDisconnect = function(){};
	this.timeStarted = (new Date()).getTime();
	try{
		this.socket = io.connect(hostname+':'+port+'/game');
	} catch (e) {
		return e;
	}
	
	var self = this;
	this.socket.on('connect', function (data) {
		console.log("Connecton established");
		self.socket.emit('set nickname', self.localPlayerName);
		self._onConnect();
	});
	this.socket.on('disconnect', function (data) {
		console.log("Connecton lost");
		self._onDisconnect();
	});
	this.socket.on('matchmaking queue', function (data) {
		console.log("Looking for a match");
		self._putOnMatchmakingQueue();
	});
	this.socket.on('name set', function (id) {
		console.log("PlayerId is now " + id);
		self.localPlayerId = id;
	});
}
/* Set an eventhandler for when a connection has been made.
 */
MPSession.prototype.onConnect = function(f){
	this._onConnect = f;
};
/* Set an eventhandler for when a connection is lost.
 */
MPSession.prototype.onDisconnect = function(f){
	this._onDisconnect = f;
};
/* Quit the session.
 */
MPSession.prototype.disconnect = function(){
	this.socket.emit('disconnectMe', playerId);
};
/* Return the number of milliseconds since the session started.
 */
MPSession.prototype.getTimeElapsed = function(){
	return (new Date()).getTime() - this.timeStarted;
};
/* Starts the matchmaking process. The player is first put on a queue, 
 * waiting for his turn to be put in a match. 
 * parameters = {filters:{max:int, min:int}, onQueue:function, onMatchFound:function}
 */
MPSession.prototype.startMatchmaking = function(parameters){
	if(this.matchInProgress) throw "Can only have one match in progress per session.";
	var self = this;
	this._putOnMatchmakingQueue = parameters.onQueue;
	this._onMatchFound = parameters.onMatchFound;
	this.socket.emit('matchmake', parameters.filters);
	this.socket.on('match found', function (data) {
		//self.matchNumber = data.match;
		//self.players.fill(data.players);
		var nm;
		if(parameters.type === "TurnBased"){
			nm = new MPTurnBasedMatch(self.socket, data.match, data.players);
		} else {
			nm = new MPMatch(self.socket, data.match, data.players);
		}
		nm.state = data.state;
		nm.host = nm.players.get(data.host.id) || data.host.id;
		self._onMatchFound(nm);
		self.matchInProgress = true;
		nm._notPartOfApi_onLeaveMatch = function(){
			self.matchInProgress = false;
			delete nm;
		};
	});
};

function MPPlayer(data){
	this.playerId = data.id || "";
	this.name = data.name || "";
}

function MPPlayerCollection(){
	this.players = [];
}
MPPlayerCollection.prototype.add = function(player){
	if(!player instanceof MPPlayer) throw "Parameter needs to be an MPPlayer object";
	this.players.push(player);
};
MPPlayerCollection.prototype.fill = function(players){
	for(var i = 0; i < players.length; i++){
		this.add(new MPPlayer(players[i]));
	}
};
MPPlayerCollection.prototype.remove = function(player){
	for(var i = 0; i < this.players.length; i++){
		if(this.players[i] === null){
			this.players.splice(i,1);
			continue;
		}
		if(this.players[i].socket.id === playerId){
			this.players.splice(i,1);
			return true;
		}
	}
	// Was not able to remove player
	return false;
};
MPPlayerCollection.prototype.get = function(playerId){
	for(var i = 0; i < this.players.length; i++){
		if(this.players[i].playerId === playerId){
			return this.players[i];
		}
	}
	// Was not able to remove player
	return false;
};
MPPlayerCollection.prototype.size = function(){
	return this.players.length;
};
MPPlayerCollection.prototype.iterate = function(f){
	for(var i = 0; i < this.players.length; i++){
		f(this.players[i]);
	}
};