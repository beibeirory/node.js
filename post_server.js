	/*
	重命名相册：

	一个POST请求：http://localhost:8080/albums/beijing/rename.json
	curl -s -X POST -H "Content-Type: application/json" \
		-d '{"album_name": "new album name"}' \
		http://localhost:8080/albums/beijing/rename.json
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

		// Node.js内置URL模块，处理URL包含的参数 parsed_url
		req.parsed_url = url.parse(req.url, true);
		var core_url = req.parsed_url.pathname;	//路径名，如/albums/qingdao.json

		if(core_url == '/albums.json' && req.method.toLowerCase() == 'get'){
			handle_list_albums(req, res);
		} else if(core_url.substr(0, 7) == '/albums' 
					&& core_url.substr(core_url.length-5) == '.json'
					&& req.method.toLowerCase() == 'get') {
			handle_get_album(req, res);
		} else if(core_url.substr(core_url.length-12) == '/rename.json' // 重命名相册处理
					&& req.method.toLowerCase() == 'post') {
			handle_rename_album(req, res);
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

	//重命名相册
	function handle_rename_album(req, res) {
		//1. get the album name form the URL
		var core_url = req.parsed_url.pathname;
		console.log(core_url);
		var parts = core_url.split('/');
		if(parts.length != 4) {
			send_failure(res, 404, invalid_resource(core_url));
			return;
		}

		var album_name = parts[2];
		console.log(album_name);

		//2. get the POST data for the request. this will have the JSON for the new name for the album.
		var json_body = '';
		req.on('readable', function() {
			var d = req.read();
			if(d) {
				if(typeof d == 'string') {
					json_body += d;
				} else if (typeof d == 'object' && d instanceof Buffer) {
					json_body += d.toString('utf8');
				}
			}
		});

		//3. when we have all the post data, make sure we have valid data and then try to do the rename.
		req.on('end', function(){
			//did we get a body?
			if(json_body) {
				try {
					var album_data = JSON.parse(json_body);
					console.log(album_data);
					if(!album_data.album_name) {
						send_failure(res, 403, missing_data('album_name'));
						return;
					}
				} catch (e) {
					// got a body, but not valid json
					send_failure(res, 403, bad_json());
					return;
				}

				//4. perform rename
				do_rename(album_name, //old 
					album_data.album_name, //new
					function(err, results) {
						if(err && err.code == "ENOENT"){
							send_failure(res, 403, no_such_album());
							return;
						} else if (err) {
							send_failure(res, 500, file_error(err));
							return;
						}
						send_success(res, null);
					});
			} else {
				// did not get a body
				send_failure(res, 403, bad_json());
				res.end();
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

	function missing_data(err) {
		return	make_error('missing_data', "err is missing!");
	}

	function bad_json() {
		return make_error("bad_json", "The json is bad!");
	}

	function file_error(err) {
		return make_error("file_error", "The file is not valid!");
	}

	var s = http.createServer(handle_incoming_request);
	s.listen(8080);
