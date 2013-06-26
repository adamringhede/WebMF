
	var socket = io.connect('Adams-MacBook-Pro.local:8084', {
		reconnect:true
	});
	socket.on('startedGameConnector', function(gameName){
		console.log("STARTED " + gameName);
	});
	socket.on('playerQueueChanged', function(data){
		console.log("playerQueueChanged " + data);
	});
	socket.on('matchesChanged', function(data){
		console.log("matchesChanged " + data);
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
    running: false,
	playersInQueue: 0
  }
});

///
/// GameMonitorsCollection
///
var GameMonitorsCollection = Backbone.Collection.extend({
	model: GameMonitor,
	initialize: function (models,options) {
	//	this.add(models);
		/*for(var i = 0; i < models.length; i++){
			this.add(models[i]);
		}*/
	}
});
var GameMonitors = new GameMonitorsCollection;

///
/// GameMonitorView
///
var GameMonitorView = Backbone.View.extend({
	tagName: 'li',
	template: _.template($('#item-template').html()),
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



