"use strict";

// ------
// Header
// ------

/*
class Interface
{
	// TODO
}
*/

// --------------
// Implementation
// --------------

var Interface = function(netstate)
{
	this.Table         = null;
	this.SVGLayer      = null;
	this.NetState      = netstate;
	this.CurrentAction = null;
	this.Selection     = null;
	this.Handles       = Object.create(null);
	this.Transitions   = Object.create(null);
	this.ActionBar     = null;
	this.MouseX        = 0;
	this.MouseY        = 0;
}

Interface.prototype.Init = function(table, svgLayer)
{
	this.Table = table;
	this.NetState.Objects.OnUpdate  .push(this.OnObjectChange  .bind(this));
	this.NetState.Objects.OnCreation.push(this.OnObjectCreation.bind(this));
	this.NetState.Objects.OnRemoval .push(this.OnObjectRemoval .bind(this));

	this.NetState.OnStateReset.push(this.OnStateReset.bind(this));

  this.Table.addEventListener('mousemove', this.OnMove.bind(this));
  this.Table.addEventListener('mouseup',   this.OnRelease.bind(this));

  // What the actual fucking fuck HTML5?! You have to change className for Grab & Drop to work
  // ...and no, it doesn't work with classList.
  // Also don't forget eating out a virgin at full moon and sacrifcing it afterwards to the dark IE gods.
	this.Table.addEventListener('dragenter', function(e){ this.className = "drag"; e.preventDefault(); });
  this.Table.addEventListener('dragend',   function(e){ this.className = "";     e.preventDefault(); });
  this.Table.addEventListener('dragover',  function(e){ e.preventDefault(); });
  this.Table.addEventListener('drop',      this.OnDrop.bind(this));
  window.addEventListener('keydown',   this.OnKeyPress.bind(this));

  this.ActionBar = document.createElement("div");
  this.ActionBar.className = "actionbar right";

  this.SVGLayer = svgLayer;
};

Interface.prototype.OnKeyPress = function(e)
{
	if(e.repeat) return;

	// Copy
	if(e.which === 67 && e.ctrlKey)
	{
		if(this.Selection)
			SetStored("clipboard", this.Selection.Data);
	}
	// Cut
	if(e.which === 88 && e.ctrlKey)
	{
		if(this.Selection)
		{
			SetStored("clipboard", this.Selection.Data);
			this.NetState.RemoveObject(this.Selection.Data);
		}
	}
	// Paste
	if(e.which === 86 && e.ctrlKey)
	{
		var copy = GetStored("clipboard");
		delete copy.ID;
		if(copy)
		{
			copy.X = this.MouseX;
			copy.Y = this.MouseY;
			this.NetState.Objects.Create(copy);
			var handle = this.Handles[copy.ID];
			this.SetCenterPos(handle, this.MouseX, this.MouseY);
		}
	}
};

Interface.prototype.ExecuteAction = function(object, action, mouseX, mouseY)
{
	var act = {};
	act.Handle  = object;
	act.Obj     = object.Data;
	act.Original = Merge(object.Data);
	act.Result  = {};
	act.Type    = action;
	console.log("Start action ", action.Label);

	var rect = object.Div.getBoundingClientRect();
	act.CenterX = (rect.left + rect.right)/2;
	act.CenterY = (rect.top  + rect.bottom)/2;

	this.CurrentAction = act;

	if(action.Type === "Single")
	{
		this.ActionCallBack("OnExecute", this.CurrentAction, mouseX, mouseY);
		this.CurrentAction = null;
	}
	else
		this.ActionCallBack("OnStartGrab", this.CurrentAction, mouseX, mouseY);
};

Interface.prototype.UpdateActionBar = function()
{
	RemoveDiv(this.ActionBar);
	this.ActionBar.innerHTML = "";

	if(this.Selection)
	{
		var mode = this.Selection.Type.Mode;
		if(mode === "Window") return;

		this.Selection.Div.appendChild(this.ActionBar);

		var menu = this.Selection.Type.MenuActions;
		this.FillMenu(this.ActionBar, this.Selection, menu);
	}
}

Interface.prototype.FillMenu = function(div, obj, menu)
{
	for(var i = 0; i < menu.length; i++)
	{
		var act = ObjHandle.Actions[menu[i]];
		var span = document.createElement('span');
		span.className = "item fa "+act.Icon;
		div.appendChild(span);

		var mdown = function(act, obj, e)
		{
			if(e.button !== 0) return false;

			e.stopPropagation();
			e.preventDefault();
			this.ExecuteAction(obj, act, e.pageX, e.pageY);
		};

		span.addEventListener("mousedown", mdown.bind(this, act, obj));
	};
}

Interface.prototype.OnDrop = function(e)
{
	e.preventDefault();
	this.Table.className = "";
	
	// Prefab-Drop
	// Internal, we won't get this from outside.
	var prefab = e.dataTransfer.getData("text/prs.prefab+json");
	if(prefab)
	{
		prefab = JSON.parse(prefab);
		prefab.X = e.pageX;
		prefab.Y = e.pageY;
		this.NetState.Objects.Create(prefab);
		return;
	}

	// URL-Drop
	// "URL"-Datatype is the first valid URL in a "text/uri-list" according to MDN
	var url = e.dataTransfer.getData("URL");
	if(url)
	{
		// Only create token if the URL is for a image.
		// Scrap that... Everyone but Imgur denies our Cross-URL XHTTP-requests.
		// Just check if the URL "looks" like a image.
		if(url.match(/.(\.png|\.jpg|\.jpeg|\.gif|\.apng)/))
		{
			var token = {Type: "Token", X: e.pageX, Y: e.pageY, Texture: url};
			this.NetState.Objects.Create(token);
		}
		else if(url.match(/.(\.mp3|\.ogg)/))
		{
			var player = {Type: "Player", X: e.pageX, Y: e.pageY, Source: url};
			this.NetState.Objects.Create(player);
		}
	}
	else // Firefox sends Images also as Files, o_O, so we have to do a either or
	{
		// File upload
		var files = e.dataTransfer.files;
		for (var i = 0; i < files.length; i++)
		{
			var file = files[i];
			if(file.type.match(/image.*/))
			{
				var self  = this;

				var reader = new FileReader();
				var token = {Type: "Token", X: e.pageX+(i*40), Y: e.pageY};
				this.NetState.Objects.Create(token);

				var image = new Image();
				reader.onload = function()
				{
					image.onload = function()
					{
						self.NetState.Objects.Update(token, {Width: image.width, Height: image.height}, self.InterfaceID);
					};
					image.src = reader.result;
					self.Handles[token.ID].PlaceholderSrc = reader.result;
				};
				reader.readAsDataURL(file);
				

				var xhttp = new XMLHttpRequest();
				var fd    = new FormData();
				fd.append('image', file);
				xhttp.open('POST', 'https://api.imgur.com/3/image');
				xhttp.setRequestHeader('Authorization', 'Client-ID c7a1ef740b6ffdd');
				xhttp.onreadystatechange = function()
				{
					if(this.readyState === 4)
					{
						if(this.status === 200)
						{
							var response = JSON.parse(this.responseText);
							self.NetState.Objects.Update(token, {Texture: response.data.link}, self.InterfaceID);
						}
						else
							self.NetState.Objects.Remove(token, self.InterfaceID);
					}
				};
				xhttp.send(fd);
			}
		};
	}
};

Interface.prototype.OnObjectChange = function(id)
{
	this.Handles[id].updateHTML();
}

Interface.prototype.OnObjectCreation = function(id, data)
{
	var obj = new ObjHandle(data);
	obj.initHTML(this);
	this.Table.appendChild(obj.Div);
	obj.Div.addEventListener('mousedown', this.OnClick.bind(this, obj));
	obj.Div.addEventListener('dblclick',  this.OnDoubleClick.bind(this, obj));
	this.Handles[id] = obj;

	var mode = obj.Type.Mode;
	obj.Div.classList.add(mode);
	if(mode === "Window")
	{
		obj.TitleBar = document.createElement("div");
		obj.TitleBar.className = "title-bar";

		obj.Title = document.createElement("input");
		obj.Title.name        = "title";
		obj.Title.innerHTML   = data.Title;
		obj.Title.placeholder = "Untitled";

		var stopPropagation = function(e){ e.stopImmediatePropagation(); };

		obj.Title.addEventListener('mousedown', stopPropagation);
		obj.Title.addEventListener('keydown', stopPropagation);

		obj.TitleBar.appendChild(obj.Title);

		obj.Menu = document.createElement("span");
		obj.Menu.className = "buttons";
		obj.TitleBar.appendChild(obj.Menu);


		this.FillMenu(obj.Menu, obj, obj.Type.MenuActions);

		if(obj.Div.firstChild)
			obj.Div.insertBefore(obj.TitleBar, obj.Div.firstChild);
		else
			obj.Div.appendChild(obj.TitleBar);
	}
}

Interface.prototype.OnObjectRemoval = function(id)
{
	var div = this.Handles[id].Div;
	div.parentNode.removeChild(div);
	delete this.Handles[id];
}

Interface.prototype.OnStateReset = function(state)
{
	this.Handles = Object.create(null);

  var last;
  while(last = this.Table.lastChild)
  	this.Table.removeChild(last);

	for(var id in state)
	{
		if(!Object.hasOwnProperty.call(state, id)) continue;
		var obj = state[id];
		this.OnObjectCreation(id, obj);
	}
}

Interface.prototype.OnClick = function(obj, e)
{
	if(e.button !== 0) return false;
	if(this.CurrentAction) return false;

	e.stopImmediatePropagation();
	e.preventDefault();

	this.ExecuteAction(obj, ObjHandle.Actions[obj.Type.ClickAction], e.pageX, e.pageY);

	this.Selection = obj;
	this.UpdateActionBar();
};

Interface.prototype.OnDoubleClick = function(obj, e)
{
	e.stopImmediatePropagation();
};

Interface.prototype.OnMove = function(e)
{
	this.MouseX = e.pageX;
	this.MouseY = e.pageY;

	if(this.CurrentAction === null) return false;

	this.ActionCallBack("OnGrabbing", this.CurrentAction, e.pageX, e.pageY);
};

Interface.prototype.OnRelease = function(e)
{
	if(this.CurrentAction === null) return false;

	e.preventDefault();
	this.ActionCallBack("OnStopGrab", this.CurrentAction, e.pageX, e.pageY);
	this.CurrentAction = null;
};

Interface.prototype.ActionCallBack = function(fname, act)
{
	var fn = act.Type[fname];
	var args = Array.prototype.slice.call(arguments, 1);
	var prevResult = act.Result;
	act.Result = {};
	args.push(this);
	args.push(this.NetState);
	// Note, fname is ignored, act is not.

	if(fn)
	{
		fn.apply(this, args);
		if(!IsEmptyObject(act.Result))
		{
			var delta = Merge(prevResult, act.Result);
			this.NetState.Objects.Update(act.Obj, delta);
		}
	}
}

Interface.prototype.SetCenterPos = function(handle, x, y)
{
	var rect    = handle.Div.getBoundingClientRect();
	var centerX = (rect.left + rect.right)/2;
	var centerY = (rect.top  + rect.bottom)/2;
	var dataX   = handle.Data.X;
	var dataY   = handle.Data.Y;
	var delta   = {X: x + (dataX - centerX), Y: y + (dataY - centerY)};
	this.NetState.Objects.Update(handle.Data, delta);
};

Interface.prototype.CalcTopZIndexFor = function(target)
{
	// Ignore this object when scanning the stack height.
	var prevPointerEvents = target.Div.style.pointerEvents;
  target.Div.style.pointerEvents = 'none';

  var rect = target.Div.getBoundingClientRect();

  var width   = rect.right - rect.left;
  var height  = rect.bottom - rect.top;

  var z = 0;

  for(var y = rect.top; y < rect.bottom; y += 20)
  for(var x = rect.left; x < rect.right;  x += 20)
  {
    var ele = document.elementFromPoint(x, y);
    // We need to go through the parent elements so we know wheter this "thing" belongs to a card.
    while(ele instanceof Element)
    {
      if(ele.GameHandle) break;
      ele = ele.parentNode;
    }

    if(ele)
    if(ele.GameHandle)
  	if(z < ele.GameHandle.Data.Z)
  	{
  		// Ignore too small elements, they should stay on top.
	    if((ele.getBoundingClientRect().width < rect.width/2))
	    	continue;
	    z = ele.GameHandle.Data.Z;
  	}
  };

  if(!prevPointerEvents)
  	target.Div.style.pointerEvents = '';
  else
  	target.Div.style.pointerEvents = prevPointerEvents;

  return z;
}

Interface.prototype.AddSVG = function(element)
{
	this.SVGLayer.appendChild(element);
}

Interface.prototype.RemoveSVG = function(element)
{
	this.SVGLayer.removeChild(element);
}