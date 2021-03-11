var ChannelWorker = {
    _impl: class {
        // BEGIN ChannelOwner contract - shared constants.
        get STATE_IDX() { return 0; }
        get MSG_SIZE_IDX() { return 1; }

        // Communication states.
        get STATE_SHUTDOWN() { return -1; } // Shutdown
        get STATE_IDLE() { return 0; }
        get STATE_REQ() { return 1; }
        get STATE_RESP() { return 2; }
        get STATE_REQ_P() { return 3; } // Request has multiple parts
        get STATE_RESP_P() { return 4; } // Response has multiple parts
        get STATE_AWAIT() { return 5; } // Awaiting the next part
        // END ChannelOwner contract - shared constants.

        constructor(comm_buf, msg_buf, msg_char_len) {
            this.comm = new Int32Array(comm_buf);
            this.msg = new Uint16Array(msg_buf);
            this.msg_char_len = msg_char_len;
        }

        async await_request(async_call) {
            console.log("await_request()");

            for (;;) {
                // Wait for signal to perform operation
                Atomics.wait(this.comm, this.STATE_IDX, this.STATE_IDLE);

                // Read in request
                var req = this._read_request();
                console.log("Request: " + req);
                if (req === this.STATE_SHUTDOWN)
                    break;

                var resp = null;
                try {
                    // Perform async action based on request
                    resp = await async_call(req);
                }
                catch (err) {
                    console.log("Request error: " + err);
                    resp = JSON.stringify(err);
                }

                // Send response
                this._send_response(resp);
            }
        }

        _read_request() {
            var request = "";
            for (;;) {
                // Get the current state and message size
                var state = Atomics.load(this.comm, this.STATE_IDX);
                var size_to_read = Atomics.load(this.comm, this.MSG_SIZE_IDX);

                // Append the latest part of the message.
                request += this._read_from_msg(0, size_to_read);

                // The request is complete.
                if (state === this.STATE_REQ)
                    break;

                // Shutdown the worker.
                if (state === this.STATE_SHUTDOWN)
                    return this.STATE_SHUTDOWN;

                // Reset the size and transition to await state.
                Atomics.store(this.comm, this.MSG_SIZE_IDX, 0);
                Atomics.store(this.comm, this.STATE_IDX, this.STATE_AWAIT);
                Atomics.wait(this.comm, this.STATE_IDX, this.STATE_AWAIT);
            }

            return request;
        }

        _read_from_msg(begin, end) {
            return String.fromCharCode.apply(null, this.msg.slice(begin, end));
        }

        _send_response(msg) {
            if (Atomics.load(this.comm, this.STATE_IDX) !== this.STATE_REQ)
                throw "WORKER: Invalid sync communication channel state.";

            var state; // State machine variable
            const msg_len = msg.length;
            var msg_written = 0;

            for (;;) {
                // Write the message and return how much was written.
                var wrote = this._write_to_msg(msg, msg_written, msg_len);
                msg_written += wrote;

                // Indicate how much was written to the this.msg buffer.
                Atomics.store(this.comm, this.MSG_SIZE_IDX, wrote);

                // Indicate if this was the whole message or part of it.
                state = msg_written === msg_len ? this.STATE_RESP : this.STATE_RESP_P;

                // Update the state
                Atomics.store(this.comm, this.STATE_IDX, state);

                // Wait for the transition to know the main thread has
                // received the response by moving onto a new state.
                Atomics.wait(this.comm, this.STATE_IDX, state);

                // Done sending response.
                if (state === this.STATE_RESP)
                    break;
            }
        }

        _write_to_msg(input, start, input_len) {
            var mi = 0;
            var ii = start;
            while (mi < this.msg_char_len && ii < input_len) {
                this.msg[mi] = input.charCodeAt(ii);
                ii++; // Next character
                mi++; // Next buffer index
            }
            return ii - start;
        }
    },

    create: function (comm_buf, msg_buf, msg_char_len) {
        return new this._impl(comm_buf, msg_buf, msg_char_len);
    }
};

// Operation to perform.
async function async_call(msg) {

    // Crypto call that uses Promises
    var data = new Uint8Array([1,2,3,4]);
    var digest = await crypto.subtle.digest('SHA-1', data);
    var arr = Array.from(new Uint8Array(digest));

    return msg.split("").reverse().join("");
}

var s_channel;

// Initialize WebWorker
onmessage = function (p) {
    // The message format in some environments doesn't appear to be consistent.
    // It is defined as and object with a data field, but in at least one
    // environment the data member is just sent as-is and not placed in a new
    // object.
    var data = p;
    if (p.data !== undefined) {
        data = p.data;
    }

    console.log(data.salutation);
    s_channel = ChannelWorker.create(data.comm_buf, data.msg_buf, data.msg_char_len);

    s_channel.await_request(async_call);
}
