	var http = require("http"),
		fs = require("fs");

	//获取指定路径下的全部文件夹
	function load_album_list(callback) {
		fs.readdir("albums", function(err, files) {
			if(err) {
				callback(make_error("file_error", JSON.stringify(err)));
				return;
			}

			var only_dirs = [];
			(function iterator (index) {
				if(index == files.length) {
					callback(null, only_dirs);
					return;
				}
				fs.stat("albums/" + files[index], function(err, stats) {
					if(err) {
						callback(make_error("file_error", JSON.stringify(err)));
						return;
					}
					if(stats.isDirectory()){
						var obj = {name: files[index]};
						only_dirs.push(obj);
					}
					iterator(index + 1);
				});
			})(0);
		});
	}

	// 获取指定路径下所有photos
	function load_album(album_name, callback){
		fs.readdir("albums/" + album_name, function(err, files) {
			if(err) {
				if(err.code == "ENOENT") {
					callback(no_such_album());
				}else{
					callback(make_error("file_error", JSON.stringify(err)));
				}
				return;
			}

			var only_files = [];
			var path = "albums/" + album_name + "/";

			(function iterator (index) {
				if(index == files.length) {
					var obj = {short_name: album_name, 
								photos: only_files};
					callback(null, obj);
					return;
				}

				fs.stat(path+files[index], function(err, stats) {
					if(err) {
						callback(make_error("file_error", JSON.stringify(err)));
						return;
					}
					if(stats.isFile()){
						var obj = {filename: files[index],
									desc: files[index]};
						only_files.push(obj);
					}
					iterator(index+1);
				});
			})(0);
		});
	}

	//主函数
	function handle_incoming_request(req, res){
		/*
		console.log("-------------------------------------------------");
		console.log(req);
		console.log("-------------------------------------------------");
		console.log(res);
		console.log("-------------------------------------------------");
		*/
		console.log("INCOMING REQUEST: " + req.method + " " + req.url);
		if(req.url == '/albums.json'){
			handle_list_albums(req, res);
		} else if(req.url.substr(0, 7) == '/albums' 
					&& req.url.substr(req.url.length-5) == '.json') {
			handle_get_album(req, res);
		} else {
			send_failure(res, 404, invalid_resource());
		}
	}

	// 处理获取albums中文件夹的请求
	function handle_list_albums(req, res) {
		load_album_list(function(err, albums) {
			if(err) {
				send_failure(res, 500, err);
				return;
			}

			send_success(res, { albums: albums});
		});
	}

	// 处理获取指定文件夹中photos的请求
	function handle_get_album(req, res){
		var album_name = req.url.substr(7, req.url.length-12);
		load_album(album_name, function(err, album_contents) {
			if(err && err.error == "no_such_album") {
				send_failure(res, 404, err);
			}else if(err) {
				send_failure(res, 500, err);
			} else {
				send_success(res, { album_data: album_contents});
			}
		});
	}

	function make_error(err, msg) {
		var e = new Error(msg);
		e.code = err;
		return e;
	}

	function send_success(res, data) {
		res.writeHead(200, {"Content-Type": "application/json"});
		var output = { error: null, data: data };
		res.end(JSON.stringify(output) + "\n");
	}

	function send_failure(res, code, err) {
		var code = (err.code) ? err.code : err.name;
		res.writeHead(code, { "Content-Type": "application/json"});
		res.end(JSON.stringify({error: code, message: err.message}) + "\n");
	}

	function invalid_resource() {
		return make_error("invalid_resource", "the requested resource does not exist.");
	}

	function no_such_album() {
		return make_error("no_such_album", "The specified album does not exist");
	}

	var s = http.createServer(handle_incoming_request);
	s.listen(8080);
