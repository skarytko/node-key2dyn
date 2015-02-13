# node-key2dyn
Keynote to Dynatrace Synthetic script converter for Node.js.

# Description
A simple Keynote script (.kht or .krs) script converter.  Uses [xml2js](https://github.com/Leonidas-from-XIV/node-xml2js) to parse Keynote script XML.

#Installation
Easiest way to install is to just use [npm](http://npmjs.org):

`npm install key2dyn`

#Usage
Easy as pie:

```javascript

var key2dyn = require('key2dyn');

var keyScript = '<script><name>My Keynote Script</name><actions><action type="Browser" /></action></script>';

key2dyn.parseXMLScript(keyScript, function(err, result) {
	if (err) console.error(err);
	
	console.log(key2dyn.convertScript(result));
});

```

That's it!