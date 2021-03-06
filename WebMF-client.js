(function(){
	function Match(socket, matchnumber, players){
		this.socket = socket;
		this.timeStarted = (new Date()).getTime();
		this.matchNumber = matchnumber;
		this.players = new PlayerCollection();
		this.players.fill(players || []);
		this.state = {};
		this.localPlayerId = "";
		this.host = null;
		this._onPlayerJoined = function(){};
		this._onPlayerDisconnect = function(){};
		this._onPlayerLeft = function(){};
		this._onStateChange = function(){};
		this._onRecieveMessage = function(){};
		this._onLeaveMatch = function(){};
		this._matchStateEventHandlers = {};
		var self = this;
		this.socket.on('playerDisconnected', function(data){
			//console.log(data.message); 
			self._onPlayerDisconnect(data.from);
			self.players.remove(data.from);
		});
		this.socket.on('playerJoined', function(data){ 
			var newPlayer = new Player(data);
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
		            		} else { // THIS CAN PROBABLY BE REMVOVED
						if(i === pathSteps.length-1){
							stateObjectReference[pathSteps[i]] = obj;
							break;
						} else {
		                			stateObjectReference = stateObjectReference[pathSteps[i]];
						}
		            }

				}
			}
			
			// Call eventhandler that are bound to a specified path
			for(var p in self._matchStateEventHandlers){
			    if(p.indexOf(path) === 0) {
			        for(var i in self._matchStateEventHandlers[p]){
			            self._matchStateEventHandlers[p][i](obj);
			        }
			    }
			}
			self._onStateChange(data.path, data.obj);
		});
	}
	/* Return the player collection.
	 */
	Match.prototype.players = function(){
		return this.players();
	};
	/* Set an eventhandler for when a player joins the match.
	 * Callback takes one argument wich is the player of type Player.
	 */
	Match.prototype.onPlayerJoined = function(f){
		this._onPlayerJoined = f;
	};
	/* Set an eventhandler for when a player disconnects.
	 * Callback takes one argument wich is the player of type Player.
	 */
	Match.prototype.onPlayerDisconnect = function(f){
		this._onPlayerDisconnect = f;
	};
	/* Set an eventhandler for when a player leaves the match.
	 * Callback takes one argument wich is the player of type Player.
	 */
	Match.prototype.onPlayerLeft = function(f){
		this._onPlayerLeft = f;
	};
	/* Set an eventhandler for when the local player gets kicked from the match.
	 */
	Match.prototype.onGotKicked = function(f){
		this.socket.on('gotKicked', f);
		this._onLeaveMatch();
	};
	Match.prototype.onLessThanMinimulayers = function(f){
		this.socket.on('lessThanMin', f);
	};
	Match.prototype.onReachedMinimulayers = function(f){
		this.socket.on('minReached', f);
	};
	/* Send data to another player. 
	 */
	Match.prototype.send = function(reciever, data, unreliable){
		if(!reciever instanceof Player) throw "Invalid reciever object";
		((unreliabe || false) ? this.socket.volatile : this.socket).emit('send', {
			match: matchNumber,
			message: data,
			reciever: reciever.playerId,
			from: this.playerId,
			unreliable: unreliable || false
		});
	};
	/* Send data to every player in the match except for the local player.
	 */
	Match.prototype.broadcast = function(data, unreliable){
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
	Match.prototype.recieve = function(f){
		this._onRecieveMessage = f;
	};
	/* Leave the match
	 */
	Match.prototype.leave = function(){
		this.socket.emit('leaveMatch');
		this._onLeaveMatch();
	};
	/* Bind an eventhandler to a custom event. This eventhandler will not be 
	 * executed if the event was triggered on this Match object. 
	 */
	Match.prototype.bind = function(type, callback){
		this.socket.on(type, function(data){
			callback(data.data, data.by);
		});
		this.socket.emit('customEvent', type);
	};
	/* Trigger and event and send out data. The player who triggers it, 
	 * will not recieve a notification, even if the player has bound to it. 
	 */
	Match.prototype.trigger = function(type, data, unreliable){
		((unreliable || false) ? this.socket.volatile : this.socket).emit(type, data);
	};
	/* Update the centralized state using a path and an object.
	 */ 
	Match.prototype.updateState = function(path, obj){
		// Remove leading and ending slashes in path
		this.socket.emit('updateState', {path:path, obj:obj});
	};
	Match.prototype.onStateChanged = function(arg1, arg2){
		if((typeof arg1 == 'string' || arg1 instanceof String) && typeof arg2 == 'function') {
			if(!this._matchStateEventHandlers[arg1]) this._matchStateEventHandlers[arg1] = [];
			this._matchStateEventHandlers[arg1].push(arg2);
		} else if (typeof arg1 == 'function') {
			self._onStateChange = arg1;
		}
	};
	/* Get the centralized state. You may use a path to only get a part of the state.
	 * If the full path cannot be found, it will return the last possible object in the path. 
	 */
	Match.prototype.getState = function(path, f){
		this.socket.emit('getState', {path:path});
		this.socket.on('gotState', function(state){
			if(!f) path(state);
			else f(state);
		});
	};
	/* Updates the local state with the centralized state.
	 * THIS SHOULD NOT BE PART OF THE ORIGIAN
	 */
	Match.prototype.renewState = function(callback){
		var self = this;
		this.getState(function(state){
			self.state = state;
			if(callback) callback(state);
		});
	};
	Match.prototype.close = function(){
		this.socket.emit('closeMatch');
	};
	Match.prototype.open = function(){
		this.socket.emit('openMatch');
	};
	/* Kick a player from the match 
	 */
	Match.prototype.kick = function(player){
		this.socket.emit('kickPlayer', (player instanceof Player) ? player.playerId : player);
	};

	function TurnBasedMatch(a,b,c){
		Match.call(this, a, b, c);
	}
	TurnBasedMatch.prototype = Object.create(Match.prototype);
	TurnBasedMatch.prototype.constructor = TurnBasedMatch;

	TurnBasedMatch.prototype.currentPlayer = null;
	TurnBasedMatch.prototype.getWhosTurn = function(){
		if(this.currentPlayer === null){
			this.currentPlayer = this.players.get(this.whosTurn);
		}
		return this.currentPlayer;
	};
	TurnBasedMatch.prototype.onTurnChanged = function(turnChanged){
		var self = this;
		this.socket.on('turnChanged', function(playerId){
			turnChanged(playerId);
			self.currentPlayer = self.players.get(playerId);
		});
	};
	TurnBasedMatch.prototype.changeTurn = function(){
		this.socket.emit('changeTurn');
	};

	function Session(name, hostname, port, gameName){
		this.connectionInfo = {
			hostname:hostname,
			port:port,
			gameName:gameName
		};
		this.localPlayerId = "";
		this.localPlayerName = name || "";
		this.matchInProgress = false;
		this.match;
		this._onConnect = function(){};
		this._onDisconnect = function(){};
		this.timeStarted = (new Date()).getTime();
	}
	/* Set an eventhandler for when a connection has been made.
	 */
	Session.prototype.connect = function(f, error){
		this._onConnect = f;
		try{
			// Connect to the server
			this.socket = io.connect(this.connectionInfo.hostname+':'+this.connectionInfo.port+'/'+this.connectionInfo.gameName, {
				reconnect:false,
				'force new connection': true
			});
			var self = this;
			
			// Handle the event of server being offline
			var connectionTimeout = setTimeout(function(){
				if(self.socket.socket.connected !== true){
					if(error) error();
					return false;
				}
			}, 3000);
			
			// Set eventlisteners on the socket
			this.socket.on('connect', function (data) {
				window.clearTimeout(connectionTimeout);
				console.log("Connecton established");
				self.socket.emit('set nickname', self.localPlayerName);
				self._onConnect();
			});
			this.socket.on('disconnect', function (data) {
				console.log("Connection lost");
				self._onDisconnect();
			});
			this.socket.on('name set', function (id) {
				console.log("PlayerId is now " + id);
				self.localPlayerId = id;
			});
		} catch (e) {
			return e;
		}
		return true;
	};
	/* Set an eventhandler for when a connection is lost.
	 */
	Session.prototype.onDisconnect = function(f){
		this._onDisconnect = f;
	};
	/* Leave the matchmaking queue
	 */
	Session.prototype.leaveQueue = function(f){
		this.socket.emit('leaveQueue', this.localPlayerId);
	};
	/* Quit the session.
	 */
	Session.prototype.disconnect = function(){
		this.socket.emit('disconnectMe', this.localPlayerId);
	};
	/* Return the number of milliseconds since the session started.
	 */
	Session.prototype.getTimeElapsed = function(){
		return (new Date()).getTime() - this.timeStarted;
	};
	/* Starts the matchmaking process. The player is first put on a queue, 
	 * waiting for his turn to be put in a match. 
	 * parameters = {filters:{max:int, min:int}, persistent:bool, type:string onQueue:function, onMatchFound:function, waitForOtherPlayers:bool}
	 */
	Session.prototype.startMatchmaking = function(parameters){
		if(this.matchInProgress) throw "Can only have one match in progress per session.";
		var self = this,
			waitForMin = parameters.filters.min || 0;
		
		// WaitForOtherPlayers should be set to true by default
		if(typeof parameters.waitForOtherPlayers !== 'boolean'){
			parameters.waitForOtherPlayers === true;
		}
		
		// While waiting for other players it may be 
		if(parameters.waitForOtherPlayers) {
			parameters.filters.min = 0;
		}
		
		// Put the player in matchmaking
		this.socket.emit('matchmake', {
			max: parameters.filters.max,
			min: parameters.filters.min, 
			persistent: parameters.persistent || false, // Defaults to false
			type: parameters.type || "", // Defaults to ety string 
			customFilters: (function(){
				var customs = {};
				for (var c in parameters.filters) {
					if ( c !== 'min' && c !== 'max' ) {
						customs[c] = parameters.filters[c];
					}
				}
				return customs;
			})
		});
		

		this.socket.on('matchmaking queue', function (data) {
			parameters.onQueue();
		});
		this.socket.on('match found', function (data) {
			var nm,
				matchFound = parameters.onMatchFound;
			
			// Create a new Matchobject depending on the type of match.
			if (parameters.type === "TurnBased") {
				nm = new TurnBasedMatch(self.socket, data.match, data.players);
				nm.whosTurn = data.whosTurn;
			} else {
				nm = new Match(self.socket, data.match, data.players);
			}
			
			// Define some attributes
			nm.localPlayerId = self.localPlayerId;
			nm.state = data.state;
			nm.host = nm.players.get(data.host.id) || new Player({playerId: data.host.id, name:"host"});
			
			if(parameters.waitForOtherPlayers){
				if(nm.players.count() >= waitForMin){
					matchFound(nm);
					return;
				}
				// Wait for enough players to joing before calling the matchFound handler. 
				nm.onPlayerJoined(function(){ 
					if(nm.players.count() >= waitForMin){
						matchFound(nm);
						nm.onPlayerJoined(function(){});
					}
				});
			} else {
				matchFound(nm);
			}
			
			
			self.matchInProgress = true;
			self.match = nm;
			nm._onLeaveMatch = function(){
				self.matchInProgress = false;
				delete nm;
			};
		});
	};
	Session.prototype.joinMatch = function(matchNum, onJoin){
		var self = this;
		console.log(matchNum);
		this.socket.emit('joinMatch', {matchNum:matchNum});
		this.socket.on('joinedMatch', function(data){
			var nm;
			if(data.type === "TurnBased"){
				nm = new TurnBasedMatch(self.socket, data.match, data.players);
			} else {
				nm = new Match(self.socket, data.match, data.players);
			}
			nm.localPlayerId = self.localPlayerId;
			nm.state = data.state;
			nm.host = nm.players.get(data.host.id) || new Player({playerId: data.host.id, name:"host"});
			if(nm instanceof TurnBasedMatch) nm.whosTurn = data.whosTurn;
			self.matchInProgress = true;
			if(onJoin) onJoin(nm);
		});
	};

	function Player(data){
		this.playerId = data.id || "";
		this.name = data.name || "";
	}
	Player.prototype.extend = function(objects, force){
		for(var obj in objects){
			if(!this[obj] || force)
				this[obj] = objects[obj];
			else 
				throw "Tried to overwrite an existing property [" +obj+ "]";
		}
	};

	function PlayerCollection(){
		this.players = [];
	}
	PlayerCollection.prototype.add = function(player){
		if(!player instanceof Player) throw "Parameter needs to be an Player object";
		this.players.push(player);
	};
	PlayerCollection.prototype.fill = function(players){
		for(var i = 0; i < players.length; i++){
			this.add(new Player(players[i]));
		}
	};
	PlayerCollection.prototype.remove = function(playerId){
		for(var i = 0; i < this.players.length; i++){
			if(this.players[i].playerId === playerId){
				this.players.splice(i,1);
				return true;
			}
		}
		// Was not able to remove player
		return false;
	};
	PlayerCollection.prototype.get = function(playerId){
		if(typeof playerId === 'number'){
			return this.players[playerId];
		}
		for(var i = 0; i < this.players.length; i++){
			if(this.players[i].playerId === playerId){
				return this.players[i];
			}
		}
		// Was not able to find player
		return false;
	};
	PlayerCollection.prototype.count = function(){
		return this.players.length;
	};
	PlayerCollection.prototype.iterate = function(f){
		for(var i = 0; i < this.players.length; i++){
			f(this.players[i]);
		}
	};


	window.WebMF = {
		Session: Session
	};
})();
