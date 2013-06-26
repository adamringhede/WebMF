
var socket = io.connect('Adams-MacBook-Pro.local:8083/administration', {
	reconnect:true
});
socket.on('error', function(){
	console.log("Could not connect.");
});
socket.on('connect', function(){
	console.log("connected!");
});

socket.on('disconnect', function(){
	console.log('got disconnected');
});

function fetchGameConnectors(func){
	socket.emit('getConnectors');
	socket.on('gotConnectors', func);
}

(function(){

///
/// GameMonitor
///
var GameMonitor = Backbone.Model.extend({
  defaults: {
    name: '',
    running: "Suspended",
	playersInQueue: 0,
	matches: 0
  }
});

///
/// GameMonitorsCollection
///
var GameMonitorsCollection = Backbone.Collection.extend({
	model: GameMonitor,
	initialize: function (models,options) {
		var self = this;
		socket.on('playerQueueChanged', function(data){
			var monitorToChange = self.findWhere({name:data.game});
			monitorToChange.set('playersInQueue', data.playerQueue);
		});
		socket.on('matchesChanged', function(data){
			var monitorToChange = self.findWhere({name:data.game});
			monitorToChange.set('matches', data.matches.length);
		});
		socket.on('startedGameConnector', function(data){
			var monitorToChange = self.findWhere({name:data.name});
			monitorToChange.set('running', "Ready");
		});
		socket.on('gotServerStates', function(games){
			for(var i in games) {
				var monitorToChange = self.findWhere({name:games[i].game});
				if(monitorToChange){
					if(games[i].running){
						monitorToChange.set('running', "Ready");
						monitorToChange.set('matches', games[i].matches.length);
						monitorToChange.set('playersInQueue', games[i].playerQueue.length);
					} else {
						monitorToChange.set('running', "Suspended");
						monitorToChange.set('matches', 0);
						monitorToChange.set('playersInQueue', 0);
					}
				}
			}
		});
	}
});
var GameMonitors = new GameMonitorsCollection;

///
/// GameMonitorView
///
var GameMonitorView = Backbone.View.extend({
	tagName: 'div',
	template: _.template($('#item-template').html()),
	initialize: function(){
		this.$el.addClass('gameBox');
		this.model.on('change', this.render, this);
	},
	render: function() {
	      this.$el.html(this.template(this.model.toJSON()));
	      return this;
	}
});

///
/// AppView
///
var AppView = Backbone.View.extend({
	el: $("#gamesMonitors"),
	initialize: function() {
		this.listenTo(GameMonitors, 'add', this.addOne);
		fetchGameConnectors(function(games){
			GameMonitors.set(games);
		});
	},
	addOne: function(monitors) {
		var view = new GameMonitorView({model: monitors});
		this.$el.append(view.render().el);
	}
});

var App = new AppView;

})();



