var http = require('http'),
    fs = require('fs'),
	config = require('./config');


fs.readFile('./WebMF-config.html', function (err, html) {
    if (err) {
        throw err; 
    }       
    http.createServer(function(request, response) {  
        response.writeHeader(200, {"Content-Type": "text/html"});  
        response.write(html);  
        response.end();  
    }).listen(8000);
});

console.log(config.games[1]);