	/*
	URL GET可以带参数
	*/
	var http = require("http"),
		fs = require("fs"),
		url = require("url");

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
	function load_album(album_name, page, page_size, callback){
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
					var ps;
					ps = only_files.splice(page * page_size, page_size);
					var obj = {short_name: album_name, 
								photos: ps};
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
		console.log("INCOMING REQUEST: " + req.method + " " + req.url);

		// Node.js内置URL模块，处理URL包含的参数
		req.parsed_url = url.parse(req.url, true);
		var core_url = req.parsed_url.pathname;	//路径名，如/albums/qingdao.json

		if(core_url == '/albums.json'){
			handle_list_albums(req, res);
		} else if(core_url.substr(0, 7) == '/albums' 
					&& core_url.substr(core_url.length-5) == '.json') {
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
		// 获取GET参数，设置合理的默认值
		var getp = req.parsed_url.query;
		var page_num = getp.page ? getp.page : 0;
		var page_size = getp.page ? getp.page_size : 1000;

		// 保证参数是数字，否则给予默认值
		if(isNaN(parseInt(page_num))) page_num = 0;
		if(isNaN(parseInt(page_size))) page_size = 1000;

		var core_url = req.parsed_url.pathname;

		var album_name = core_url.substr(7, core_url.length-12);
		//console.log(album_name);
		load_album(album_name, page_num, page_size, function(err, album_contents) {
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
