#  WebMF

A javascript framework using web sockets and simplifying the development of multiplayer games using web technologies.

## About

### Mission

To create a platform for developers making multiplayer games. It should have an easy to use api, while at the same time be highly functional and suit the needs of most applications. The developer should be able to make use of all the functionality with little to no knowledge of networking.

### Features
	– Matchmaking
		- Be put in a match automatically. 
		- Use filters for the match-selection.
			- Custom filters
			- Filters for minimum players in match, and maximum number of spots in match. 
		- Automatically create a new match if none is found. 
		- The first player to start matchmaking will be prioritized. 
	– Broadcast data in current match.
	– Send data to a single player in your match.
	– The reciever of data will know who it came from.
	– Send data as any type of javascript object.
	– Be notified when another player joins the match, leaves and gets disconnected.
	– Create custom events and listeners for the match. 
	– Be assigned a unique id on connection, so you can use any nickname you want. 
	– No polling for events or messages. 
	– All messaging is reliable by default and asynchronous. 
	– Close matches (so no new players can join), and open matches. Matches are open by default.
	– Have the option to create a turnbased match 
		- Be notified when the turn changes
	– Device independant. Create multiplayer games that can run on smartphones, tablets and desktop devices. 
	– Write to a centralized matchstate that will update the state at every other client. 
		- The other clients can be notified about the change.
		- Choose to use a persistant matchstate that will be retained, so that you can continue
		  playing from where you left of. 
	– Choose a host for client-server architectures on top of the platform. 
		- Send data to the host dynamically
	– Send faster but unreliable messages
	– Kick a player from the match.
	– Host several multiplayer games on the same node service. 
	– Join a specified ongoing open match without the use of matchmaking
		- (Planned) If the match the match is full, be put in a queue. 
			- The player can be notified when its position in the queue changes. 

### Q&A

#### Q: I'm new to web development, will I be able to use this?
A: One of the goals with this framework is to make it as easy and beginner friendly as it can get. 
You don't need any theoretical or technical knowledge about networks or the internet.
Basic JavaScript knowledge is enough to start developing fun multiplayer games with this framework. 

#### Q: There are a lot of multiplayer frameworks for the web already, why do we need another?
A: Those who already exist usually requires that the developers have a sound understanding 
of networking. They are also often built for one type of games, and are very restricting or 
does not even provide a lot of functionality so you will still end up having to write most of 
the networking yourself anyway. Some involve things that have nothing to do with networking 
like user input and graphics which makes the framework less versatile and device dependent.
Some takes a very long time to setup and has a steep learning curve. There is a need for 
something easier, more beginner friendly.  

	
### Dependencies
	– Node.js
	– socket.io
	– MongoDB
	– Mongoskin
	– Lo-Dash

## Get started

### Setup

#### Step 1. Setup the backend
Add the file WebMF-server.js somewhere on your server.
Start the server by using the following command from the terminal:
``` Shell
node WebMF-server.js
```

#### Step 2. Add WebMF and socket.io to your web application
Import the file WebMF-client.js to the directory you will use for the web application. 
Do the same with socket.io.min.js Add the following lines in your HTML-file:

```HTML
<script src="socket.io.min.js" type="text/javascript"></script>
<script src="WebMF-client.js" type="text/javascript"></script>
```

### Code examples
The followning code examples are on the client side. 

#### Initializing a session
The first thing that has to be done is to create a new session, which is done using the following code.
Let's say we have our game on the server myGame.example.com, listening to port 8083 for new connection and the local
player will use the nickname John Doe. 
```JS
var session = new MPSession("John Doe", "myGame.example.com", "8083"),
```
#### Using matchmake
The following code first creates a callback for when a new connection is established, and starts matchmaking
with some parameters. When matchmaking starts, the player will be put in a queue until a match is found.
The parameters onQueue and onMatchFound are set to handle these events. Filters specify the minimum amount of 
players there has to be in a match. If there is no match, a new one will created for the player with the specified
filters, as long as the minimum number of players is 0. If the minimum is more than 0, the player will have to wait
until there is a match with open spots with at least the amount of players the minimum states. The second filter is
the maximum number of players there will be able to be in a match. 
```JS
session.onConnect(function(){
	session.startMatchmaking({
		filters: {
			min: 2,
			max: 4
		},
		onQueue: function(){
			console.log("Looking for a match");
		},
		onMatchFound: function(match){
			console.log("Found a match");
		}
	});
});
```
#### Binding and triggering events on the match
Once you have recieved a new match object (passed as a parameter to the onMatchFound-callback) you can start doing 
alot of things with it. One thing is to bind and trigger events. To listen for for an event called playerMoved you
can use the following code.
```JS
match.bind("playerMoved", function(data){
	console.log("Player " + data.playerNickname + " moved to X:" + data.position.x + " Y:" + data.position.y);
});
```

To trigger this event another client could use the following code.
```JS
match.trigger("playerMoved", {
	playerNickname:"John Doe",
	position: {
		x: 24,
		y: 5
	}
});
```
