(function(root, document) {

  var SlackApp = root.SlackApp = root.SlackApp || {};

  root.SACallback = null;

  // Instagram client id
  var CLIENT_ID = 'a2f83a18702445b19f484bd3c658f09d';

  // sets id of script tag generated with jsonp request.
  // cached to easily remove old tags on new requests.
  var _lastSearchId = null;

  SlackApp.Utils = {
    makeNode: function(nodeName, props) {
      nodeName = nodeName || 'div';
      props = props || {};

      var node = document.createElement(nodeName);
      this.extend(node, props);

      return node;
    },

    addClass: function(className, node) {
      if (!node) {
        return;
      }

      var currentClasses = node.className;

      if (!(new RegExp(className).test(currentClasses))) {
        node.className = currentClasses + ' ' + className;
      }
    },

    removeClass: function(className, node) {
      if (typeof node === 'null' || typeof node === 'undefined') {
        return;
      }

      var currentClasses = node.className;

      if (new RegExp(className).test(currentClasses)) {
        node.className = node.className.replace(' ' + className, '');
      }
    },
    // copy multiple sources to a destation object, overriding previous keys.
    extend: function(dest /** ...sources **/) {
      var args = [].slice.call(arguments, 1);

      if (!dest) {
        return;
      }

      while (args.length !== 0) {
        var source = args.shift();
        var prop;

        for (prop in source)  {
          dest[prop] = source[prop];
        }
      }

      return dest;
    },

    jsonpRequest: function(url, callbackFn) {
      if (_lastSearchId) {
        // refactor -- could be batched with placing the new tag to prevent an additional reflow.
        document.removeChild(document.getElementById(_lastSearchId));
      }

      var tag = document.createElement('script'),
          parent = document.getElementsByTagName('script')[0];

      _lastSearchId = tag.id = +new Date;

      root.SLAppCallback = SlackApp.jsonpCallback(callbackFn);
      tag.src = url + '&callback=SLAppCallback';
      parent.parentNode.insertBefore(tag, parent.nextSibling);
    },

    numInRange: function(min, max) {
      return (Math.random() * max - min + 1 + min) | 0;
    }
  };

  SlackApp.jsonpCallback = function appCallback(callback) {
    return function(responseObj) {
      callback(responseObj);
    }
  };


  function InstagramService() {
    var BASE_TAGS_URL = 'https://api.instagram.com/v1/tags/';
    var DEFAULT_TAGS = [
      'yardsale',
      'punkrock',
      'beeroclock',
      'kittens',
      'hashtag',
      'onfleek',
      'brianthecat',
      'killingit'
    ];

    var _images = [],
        _loadedImages = {},
        _currentIdx = null,
        _tag = null,
        _listeners = {};


    return {
      search: function(tag) {
        tag = tag || DEFAULT_TAGS[SlackApp.Utils.numInRange(0, DEFAULT_TAGS.length - 1)];

        var requestUrl = BASE_TAGS_URL + tag + '/media/recent?client_id=' + CLIENT_ID;

        SlackApp.Utils.jsonpRequest(requestUrl, function(body) {
          if (body.meta.code === 200) {

            // Only supporting images for this challenge.
            _images = body.data.filter(function(medium) {
              return medium.type === 'image';
            }).map(this._addImageModel);

            this.setTag(tag);

            this.trigger('change:images');
          }
        }.bind(this));
      },

       _addImageModel: function(image) {
        var model = new SlackApp.ImageModel({
          thumbnail: image.images.thumbnail,
          standard_resolution: image.images.standard_resolution,
          caption: image.caption && image.caption.text
        });

        return model;
      },

      getImages: function() {
        return _images;
      },

      getTag: function() {
        return _tag;
      },

      setTag: function(tag) {
        _tag = tag;
        this.trigger('change:tag');
      },

      getCurrentImage: function() {
        return this.getImages()[_currentIdx];
      },

      setCurrent: function(id) {
        var len = this.getImages().length - 1;
        var lastIdx = _currentIdx;

        id = id > len ? 0 :
             id < 0 ? len :
             id;


        _currentIdx = id;
        this.trigger('change:current', lastIdx, _currentIdx);
      },

      getCurrentIndex: function() {
        return _currentIdx;
      },

      setLoaded: function(idx) {
        _loadedImages[idx] = true;
      },

      getLoaded: function(idx) {
        return _loadedImages[idx];
      },

      on: function(eventName, handler, ctx) {
        _listeners[eventName] = _listeners[eventName] || [];
        _listeners[eventName].push(handler.bind(ctx));
      },

      trigger: function(eventName) {
        var rest = [].slice.call(arguments, 1);

        _listeners[eventName].forEach(function(fn) {
          fn.apply(null, rest);
        });
      }
    };
  }


  SlackApp.ImageModel = function(options) {
    this.attributes = SlackApp.Utils.extend({},this.defaults, options);
  };

  SlackApp.Utils.extend(SlackApp.ImageModel.prototype, {
    init: function() {},

    defaults: {
      thumbnail: {},
      standard_resolution: {},
      caption: ''
    },
    getDerivative: function(derivative) {
      var derivativeInfo = this.attributes[derivative];
      return derivativeInfo;
    },

    getUser: function() {
      return this.attributes.user;
    },

    getCaption: function() {
      return this.attributes.caption;
    }
  });


  function LightBox(el) {
    this.el = el;

    /** Child views **/
    this.overlay = new OverlayView(document.querySelector('.overlay'));
    this.loader = this.el.querySelector('.loader');
    this.nav = new LightboxNavView(this.el.querySelector('.lightbox__nav'));
    this.caption = this.el.querySelector('.lightbox__caption');

    this.isOpen = !!this.isOpen;

    this.render = function(model, currentIdx) {
      if (!model) {
        return;
      }

      var img = this.el.querySelector('.lightbox__medium');
      var derivative = model.getDerivative('standard_resolution');

      this.open();

      if (!instaService.getLoaded(currentIdx)) {
        SlackApp.Utils.addClass('visible loader-animate', this.loader);
      }

      img.onload = function(event) {
        var image = event.target;

        instaService.setLoaded(currentIdx);
        this._resetCaption(model.getCaption());
        SlackApp.Utils.addClass('fade-in', image);
        SlackApp.Utils.removeClass('visible loader-animate', this.loader);
      }.bind(this);

      this._resetImage(img, derivative);
    };

    this._resetImage = function(img, derivative) {
      img.src = '';
      img.height = derivative.height;
      img.width = derivative.width;
      img.src = derivative.url;
    };

    this._resetCaption = function(caption) {
      var captionNode = this.caption.querySelector('.lightbox__caption-inner');
      captionNode.textContent = caption;
    };

    this.open = function() {
      if (this.isOpen) {
        return;
      }

      SlackApp.Utils.addClass('active', this.el);
      this.el.style.top = window.pageYOffset + 15 + 'px';
      this.isOpen = true;
      SlackApp.Utils.addClass('flip-and-fade', this.el);
      SlackApp.Utils.addClass('visible', this.nav);
      this.overlay.toggle();
    };

    this.close = function() {
      if (!this.isOpen) {
        return;
      }

      this.isOpen = false;
      SlackApp.Utils.removeClass('flip-and-fade', this.el);

      this._tempFn = this._afterCloseTransition.bind(this);
      this.el.addEventListener('transitionend', this._tempFn);
    };

    this._afterCloseTransition = function(event) {
      this.getImage().src = '';
      SlackApp.Utils.removeClass('active', this.el)
      this.el.removeEventListener('transitionend', this._tempFn);
      this._tempFn = null;
      this.overlay.toggle();
      instaService.setCurrent(null);
    };

    this.getImage = function() {
      return this.el.querySelector('.lightbox__medium');
    };

    this.showPrev = function() {
      instaService.setCurrent(instaService.getCurrentIndex() - 1);
    };

    this.showNext = function() {
      instaService.setCurrent(instaService.getCurrentIndex() + 1);
    };

    this.activateNav = function(button) {
      this.nav.activate(button);
    };

    this._bindEvents = function() {
      this.el.querySelector('.lightbox__close').addEventListener('click', this.close.bind(this));
      this.el.querySelector('.lightbox__prev').addEventListener('click', this.showPrev.bind(this));
      this.el.querySelector('.lightbox__next').addEventListener('click', this.showNext.bind(this));
      instaService.on('change:current', function() {
        this.render(instaService.getCurrentImage(), instaService.getCurrentIndex());
      }, this);
    };

    this._bindEvents();
  }

    function GalleryView(el) {
      this.el = el;
      this.views = [];
      this.ACTIVE_CLASS = 'gallery__img-selected';

      this.render = function() {
        var fragment = document.createDocumentFragment();

        this.views.forEach(function(view) {
          fragment.appendChild(view);
        });

        this.el.appendChild(fragment);

        return this;
      };

      this.dispose = function() {
        var self = this;

        this.views.forEach(function(view) {
          view.removeEventListener('click', onImgClick);
          self.el.removeChild(node);
        });

        this.views.length = 0;

        return this;
      };

      this.setActive = function(lastIndex, currentIndex) {
        SlackApp.Utils.removeClass(this.ACTIVE_CLASS, this.views[lastIndex]);
        SlackApp.Utils.addClass(this.ACTIVE_CLASS, this.views[currentIndex]);
      },

      this.onImgClick = function(event) {
        var nextActive = +event.target.id;

        instaService.setCurrent(nextActive);
      };

      this.addViews = function() {
        instaService.getImages().forEach(this._addView.bind(this));
      };

      this._addView = function(model, index) {
        var derivative = model.getDerivative('thumbnail');

        var wrapper = SlackApp.Utils.makeNode('div', {
          className: 'gallery__img-wrapper'
        });

        var imgNode = SlackApp.Utils.makeNode('img', {
          id: index,
          src: derivative.url,
          width: derivative.width,
          height: derivative.height,
          className: 'gallery__img'
        });

        imgNode.onload = function() {
          SlackApp.Utils.addClass('fade-in', this)
        };

        wrapper.appendChild(imgNode);
        wrapper.addEventListener('click', this.onImgClick.bind(this));
        this.views[index] = wrapper;
     };

    instaService.on('change:current', this.setActive, this);
    instaService.on('change:images', function() {
      this.addViews();
      this.render();
    }, this);
  }

  function OverlayView(el) {
    this.isActive = !!this.isActive;
    this.el = el;

    this.toggle = function() {
      this.isActive = this.isActive ? false : true;
      SlackApp.Utils[this.isActive ? 'addClass' : 'removeClass']('fade-in active', this.el);
    };
  }

  function HashTagView(el) {
    this.el = el;

    this.render = function() {
      this.el.textContent = '#'+instaService.getTag();
    };

    instaService.on('change:tag', this.render.bind(this));
  }

  function LightboxNavView(el) {
    this.el = el;

    this.activate = function(button) {
      var button = this.el.querySelector('.lightbox__nav .lightbox__' + button);

      SlackApp.Utils.addClass('activate', button);

      setTimeout(function() {
        SlackApp.Utils.removeClass('activate', button);
      }, 350);
    };
  }

  function AppController() {
    this.lightBox = new LightBox(document.querySelector('.lightbox'));
    this.galleryView = new GalleryView(document.getElementById('gallery'));
    this.HashTagView = new HashTagView(document.querySelector('.hashtag'));

    this._dispatchKeyHandler = function(event) {
      switch (event.keyCode || event.which) {
        case 27:
          this.lightBox.close();
          this.lightBox.activateNav('close');
          break;
        // left keypress
        case 37:
          this.lightBox.showPrev();
          this.lightBox.activateNav('prev');
          break;
        // right keypress
        case 39:
          this.lightBox.showNext();
          this.lightBox.activateNav('next');
          break;
      }
    };

    this._bindEvents = function() {
      document.body.addEventListener('keydown', this._dispatchKeyHandler.bind(this));
    };

    this._bindEvents();
  }


  var instaService = new InstagramService();
  new AppController();

  instaService.search();
})(window, document);

