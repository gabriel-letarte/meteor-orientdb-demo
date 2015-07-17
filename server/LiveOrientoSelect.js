var EventEmitter = Meteor.npmRequire('events').EventEmitter;
var util = Meteor.npmRequire('util');

Meteor.LiveOrientDB.LiveOrientoSelect = LiveOrientoSelect;
/*
 *
 * @object
 * @name LiveOrientoSelect
 * @description :
 *   1. why EventEmitter?
 *   2. query is the sql which is replaced every :name in sql by value of :name in params
 *   3. data is
 *   4. table in options.params is the class in sql;
 *   5. we avoid to use word 'class' and declaring the table is to determine whether the changes affect it later;
 */
function LiveOrientoSelect(sql, options, base) {
  if(!sql)
    throw new Error('sql required');
  if(!(options instanceof Object))
    throw new Error('options Object required');
  if(typeof base !== 'object')
    throw new Error('base LiveOrientDB instance required');

  var self = this;
  EventEmitter.call(self);

  self.sql = sql;
  self.options = options;
  self.base = base;

  self.params = options.params;
  self.table = options.params.table;
  self.laseUpdate = 0;
  self.query = [sql, options]; // I don't know how to write the method, but I think query is just a text for distinguishing each other.
  self.data = [];
  // if((self.query in base._resultsBuffer)) {
      self.startLiveQuery(sql, options)
    // }
    self.runFirstQuery(function() {
      // self._setRecords(base._resultsBuffer[self.query]);
    });
}

util.inherits(LiveOrientoSelect, EventEmitter);

/*
 *
 * @method
 * @name matchRecordChange
 * @description :
 *   1. changes is returned by triggers;
 *   2. changes should contain the information of the database and the class where the records come from;
 *   3. make sure whether the changes affect the select instance in _select;
 *
 */
LiveOrientoSelect.prototype.matchRecordChange = function(changes) {
  var self = this;
  if(changes._boundTo.name == self.base.db.name && 'play' == self.table ){
    return true;
  } else {
    return false;
  }
};

LiveOrientoSelect.prototype._setRecords = function(records) {
  var self = this;
  self.data = records.map(function(record){
    return record.value
  });

  self.data.forEach(function(value, index) {
    self.emit('added', value, index);
  });
}

/*
 * @method
 * @name _setRecords
 * @description :
 *   1. "records" is the result of a select; ? an array of objects ?
 *   2. we set latest records into self.data;
 *   3. we emit every event to ?;
 *
 */
// LiveOrientoSelect.prototype._setRecords = function(records) {
//   var self = this;
//   self.emit('update', records);

//   if(!self.base.settings.skipDiff) {
//     var diffEvent = function(){
//       self.emit.apply(self, arguments);
//     }

//     records.forEach(function(record, index) {
//       record['@rid'] = exctractRID(record);
      
//       if(self.data.length - 1 < index){
//         diffEvent('added', record.value, index);

//         self.data[index] = record.value;


//       } else if(JSON.stringify(self.data[index]) !== JSON.stringify(record)) {
//         diffEvent('changed', self.data[index], record.value, index);
//         self.data[index] = record.value;
//       }
//     });

//     if(self.data.length > records.length) {
//       for(var i = self.data.length - 1; i >= records.length; i--) {
//         diffEvent('removed', self.data[i], i);

//       }
//       self.data.splice(records.length, self.data.length - records.length);
//     }
//   }

//   self.lastUpdate = Date.now();
// };

function exctractRID(updateData) {
    return '#' + updateData.cluster + ":" + updateData.position; 
}

LiveOrientoSelect.prototype.startLiveQuery = function(query) {
  var self = this;

  self.base.db.liveQuery("LIVE " + query)
    .on('live-insert', function(data) {
     
     //new record inserted in the database,
     var newRecord = data.content;
     newRecord['@rid'] = exctractRID(data);
     if(!self.data.some(function(record) {return record.name == newRecord.name})) {
      self.data.push(newRecord);
      self.emit('added', newRecord, self.data.length - 1);
    }
    })
    .on('live-delete', function(data) {
      //record just deleted, receiving the old content
      var removedRecord = data.content;
      removedRecord['@rid'] = exctractRID(data);
      var oldRecord = self.data.filter(function(record) {return record.name == removedRecord.name} )[0]
      var oldIndex = self.data.indexOf(oldRecord);

      self.emit('removed', oldRecord, oldIndex);
    })
    .on('live-update', function(data) {
      //record updated, receiving the new content
      var updatedRecord = data.content;
      updatedRecord['@rid'] = exctractRID(data);
      var oldRecord = self.data.filter(function(record) {return record.name == updatedRecord.name} )[0]

      if(JSON.stringify(updatedRecord) !== JSON.stringify(oldRecord)) {
        var oldIndex = self.data.indexOf(oldRecord);
        self.data[oldIndex] = updatedRecord;
      
        self.emit('changed', oldRecord, updatedRecord, oldIndex);
      }
    });
}


/*
 *
 * @method
 * @name runFirstQuery
 * @description :
 *   1. we do select in this method;
 *   2. then if no error, we save the data of the query and results in _resultsBuffer which means update;
 *   3. and set latest records into self.data;
 *
 */
LiveOrientoSelect.prototype.runFirstQuery = function(callback) {
  var self = this;
  
  self.base.db.exec(self.sql, self.options).then(function(response) {
    var records = response.results[0].content;
    self._setRecords(records);
    callback && callback.call(self, undefined, records);;
  });
};

/*
 *
 * @method
 * @name stop
 * @description :
 *   1. I do not known what is for.
 *   2.
 *   3.
 *
 */
LiveOrientoSelect.prototype.stop = function(){
  var self = this;
  var index = self.base._select.indexOf(self);
  if(index !== -1){
    self.base._select.splice(index, 1);
    return true;
  } else {
    return false;
  }
};


/*
 *
 * @method
 * @name active
 * @description :
 *   1. I do not known what is for neither.
 *   2.
 *   3.
 *
 */
LiveOrientoSelect.prototype.active = function() {
  var self = this;
  return self.base._select.indexOf(self) !== -1;
};


/*
 *
 * @method
 * @name _publishCursor
 * @description :
 *   1. this passes update to the subscribed clients.
 *   2. it registers each subscriber to the LiveOrientoSelect event emitter
 *   3. and when an update happens sends every client the new information
 */
LiveOrientoSelect.prototype._publishCursor = function(sub) {
  var eventEmitter = this;
  var initLength;

  sub.onStop(function(){
    eventEmitter.stop();
  });

  // Send reset message (for code pushes)
  sub._session.send({
    msg: 'added',
    collection: sub._name,
    id: sub._subscriptionId,
    fields: { reset: true }
  });

  eventEmitter.on('update', function(records){
    if(sub._ready === false){
      initLength = records.length;
      if(initLength === 0) sub.ready();
    }
  });

  eventEmitter.on('added', function(record, index) {
    sub._session.send({
      msg: 'added',
      collection: sub._name,
      id: sub._subscriptionId + ':' + index,
      fields: record
    });
    
    if(sub._ready === false &&
       eventEmitter.data.length === initLength - 1) {
      sub.ready();
    }      
  });

  eventEmitter.on('changed', function(oldRecord, newRecord, index) {
    sub._session.send({
      msg: 'changed',
      collection: sub._name,
      id: sub._subscriptionId + ':' + index,
      fields: newRecord
    });
  });

  eventEmitter.on('removed', function(row, records, index) {
    sub._session.send({
      msg: 'removed',
      collection: sub._name,
      id: sub._subscriptionId + ':' + records,
    });
  });
  }