var EventSupport = UI.EventSupport = {};

var DomBackend = UI.DomBackend;

// List of events to always delegate, never capture.
// Since jQuery fakes bubbling for certain events in
// certain browsers (like `submit`), we don't want to
// get in its way.
//
// We could list all known bubbling
// events here to avoid creating speculative capturers
// for them, but it would only be an optimization.
var eventsToDelegate = EventSupport.eventsToDelegate = {
  blur: 1, change: 1, click: 1, focus: 1, focusin: 1,
  focusout: 1, reset: 1, submit: 1
};

var EVENT_MODE = EventSupport.EVENT_MODE = {
  TBD: 0,
  BUBBLING: 1,
  CAPTURING: 2
};

var HandlerRec = function (elem, type, selector, handler, recipient) {
  this.elem = elem;
  this.type = type;
  this.selector = selector;
  this.handler = handler;
  this.recipient = recipient;

  this.mode = EVENT_MODE.TBD;

  // It's important that delegatedHandler be a different
  // instance for each handlerRecord, because its identity
  // is used to remove it.
  //
  // It's also important that the closure have access to
  // `this` when it is not called with it set.
  this.delegatedHandler = (function (h) {
    return function (evt) {
      if ((! h.selector) && evt.currentTarget !== evt.target)
        // no selector means only fire on target
        return;
      return h.handler.apply(h.recipient, arguments);
    };
  })(this);

  // WHY CAPTURE AND DELEGATE: jQuery can't delegate
  // non-bubbling events, because
  // event capture doesn't work in IE 8.  However, there
  // are all sorts of new-fangled non-bubbling events
  // like "play" and "touchenter".  We delegate these
  // events using capture in all browsers except IE 8.
  // IE 8 doesn't support these events anyway.

  var tryCapturing = elem.addEventListener &&
        (! eventsToDelegate.hasOwnProperty(
          DomBackend.parseEventType(type)));

  if (tryCapturing) {
    this.capturingHandler = (function (h) {
      return function (evt) {
        if (h.mode === EVENT_MODE.TBD) {
          // must be first time we're called.
          if (evt.bubbles) {
            // this type of event bubbles, so don't
            // get called again.
            h.mode = EVENT_MODE.BUBBLING;
            DomBackend.unbindEventCapturer(
              h.elem, h.type, h.capturingHandler);
            return;
          } else {
            // this type of event doesn't bubble,
            // so unbind the delegation, preventing
            // it from ever firing.
            h.mode = EVENT_MODE.CAPTURING;
            DomBackend.undelegateEvents(
              h.elem, h.type, h.delegatedHandler);
          }
        }

        h.delegatedHandler(evt);
      };
    })(this);

  } else {
    this.mode = EVENT_MODE.BUBBLING;
  }
};
EventSupport.HandlerRec = HandlerRec;

HandlerRec.prototype.bind = function () {
  // `this.mode` may be EVENT_MODE_TBD, in which case we bind both. in
  // this case, 'capturingHandler' is in charge of detecting the
  // correct mode and turning off one or the other handlers.
  if (this.mode !== EVENT_MODE.BUBBLING) {
    DomBackend.bindEventCapturer(
      this.elem, this.type, this.selector || '*',
      this.capturingHandler);
  }

  if (this.mode !== EVENT_MODE.CAPTURING)
    DomBackend.delegateEvents(
      this.elem, this.type,
      this.selector || '*', this.delegatedHandler);
};

HandlerRec.prototype.unbind = function () {
  if (this.mode !== EVENT_MODE.BUBBLING)
    DomBackend.unbindEventCapturer(this.elem, this.type,
                                   this.capturingHandler);

  if (this.mode !== EVENT_MODE.CAPTURING)
    DomBackend.undelegateEvents(this.elem, this.type,
                                this.delegatedHandler);
};

EventSupport.listen = function (element, events, selector, handler, recipient, getParentRecipient) {

  var eventTypes = [];
  events.replace(/[^ /]+/g, function (e) {
    eventTypes.push(e);
  });

  for (var i = 0, N = eventTypes.length; i < N; i++) {
    var type = eventTypes[i];

    var eventDict = element.$blaze_events;
    if (! eventDict)
      eventDict = (element.$blaze_events = {});

    var info = eventDict[type];
    if (! info) {
      info = eventDict[type] = {};
      info.handlers = [];
    }
    var handlerList = info.handlers;
    var handlerRec = new HandlerRec(
      element, type, selector, handler, recipient);
    handlerRec.bind();
    handlerList.push(handlerRec);
    // move handlers of enclosing ranges to end
    if (getParentRecipient) {
      for (var r = getParentRecipient(recipient); r;
           r = getParentRecipient(r)) {
        // r is an enclosing range (recipient)
        for (var j = 0, Nj = handlerList.length;
             j < Nj; j++) {
          var h = handlerList[j];
          if (h.recipient === r) {
            h.unbind();
            h.bind();
            handlerList.splice(j, 1); // remove handlerList[j]
            handlerList.push(h);
            j--; // account for removed handler
            Nj--; // don't visit appended handlers
          }
        }
      }
    }
  }
};
