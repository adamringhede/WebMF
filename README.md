#  WebMF

A javascript framework using web sockets to simplify the process of making multiplayer games with web technologies that can work across different platforms.

## About

### Mission

To create a platform for developers making multiplayer games. It should have an easy to use api, while at the same time be highly functional, suiting the needs of most applications. The developer should be able to make use of most if not all of the functionality with little to no knowledge of networking.

### Features
	– Matchmaking
		- Be put in a match automatically. 
		- Have a backup routine for when a 
		- Use filters for the match-selection.
			- (Planned #1) Custom filters
			- Filters for minimum players in match, and maximum number of spots in match. 
		- Automatically create a new match if none is found. 
		- The first player to start matchmaking will be prioritized. 
	– Broadcast data in current match.
	– Send data to a single player in your match.
	– The reciever of data will know who it came from.
	– Send data as any type of javascript object, even executable functions. 
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
	– Choose a host for client-server architectures on top of the platform. 
		- Send data to the host
	– Send faster but unreliable messages
	– Kick a player from the match.
	– (Planned #?) Join a specified ongoing open match without the use of matchmaking
		- If the match the match is full, be put in a queue. 
			- The player can be notified when its position in the queue changes. 
	– (Planned #2) Massive Multiplayer matches for huge games with different needs.
		- Save state to permanent storage
	– (Planned #2) Use plugins on top of the platform. 
	– (Planned #2) A program to run from a CLI to manage plugins. (list, update, install, get)
	
### Plugins
	– (Planned) Graphical UI for matchmaking
	– (Planned) Chat with UI
	– (Planned) Vote-kick
	
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

#### Q: This project is really cool, how can I get involved?
A: Just using the framework and submitting feedback is worth a lot at this stage. 
If you want to help out with documentation, tutorials, testing, implementation, or coming up with new features or requirements, contact me (Adam Ringhede) by email. 
	
### Dependencies
	– Node.js
	– socket.io

## Get started

### Setup

#### Step 1. Install node and socket.io
If you have used or already installed node and socket.io this step can be skipped.

Download node from nodejs.org and install it on whatever operating system you are using.

You can install socket.io with the following command from the terminal:
``` Shell
npm install socket.io-client
```

#### Step 2. Setup the backend
Add the file WebMF-server.js somewhere on your server.
Move to the directory you put the file in and start the server by 
using the following command from the terminal:
``` Shell
node WebMF-server.js
```

#### Step 3. Add WebMF to your web application
It is very easy to start using this framework. Just import the file WebMF-client.js to your directory
you will use for the web. Add the following line in your HTML-file:

```HTML
<script src="WebMF-client.js" type="text/javascript"></script>
```
