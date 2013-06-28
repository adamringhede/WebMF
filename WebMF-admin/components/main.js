//var socket = io.connect(window.location.hostname+':8083/administration', {
var socket = io.connect('Adams-MacBook-Pro.local:8083/administration', {
	reconnect:true
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
	matches: 0,
	matchInfos: []
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
						monitorToChange.set('matchInfos', games[i].matches);
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
		if(this.model.get('running') !== "Ready"){
			this.$el.find('span.label').removeClass('label-success').addClass('label-default');
		} else {
			this.$el.find('span.label').removeClass('label-default').addClass('label-success');
		}
	//	this.$el.find('div.matchesDisplay').empty();
		for(var i = 0, l = this.model.get('matches'); i < l; i++){
			var match = this.model.get('matchInfos')[i];
			if(match === undefined) continue;
			if(match === null) {
				this.$el.find('div.matchesDisplay').append($('<div style="width:'+100/l+'%" class="match">'));
			} else {
				console.log(match);
				this.$el.find('div.matchesDisplay').append(
					$('<div style="width:'+100/l+'%" class="match inProgress">')
						.data('title', "Players: " + match.players.length + "/" + match.maxSize + "<br/>Closed: " + match.closed)
						.tooltip({
							placement:'top',
							html:true
						})
				);
			}
		}
		return this;
	}
});

///
/// AppView
///
var AppView = Backbone.View.extend({
	el: $("#gamesMonitors"),
	initialize: function() {
		var self = this;
		var wasDisconnected = false;
		socket.on('error', function(){
			self.$el.addClass('connectionError');
		});
		socket.on('disconnect', function(){
			wasDisconnected = true;
			self.$el.addClass('disconnected');
		});
		socket.on('connect', function(){
			self.$el.removeClass('disconnected');
			if(!wasDisconnected) return;
			self.$el.addClass('connected');
			setTimeout(function() {
				self.$el.removeClass('connected');
			}, 3000);
		});
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



