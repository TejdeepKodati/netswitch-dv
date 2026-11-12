// =============================================================================
// Module: drr_arbiter.v
// Description: Deficit Round Robin (DRR) Scheduler and Arbiter.
//              Allocates bandwidth according to configurable per-queue quantum weights,
//              preventing Head-of-Line blocking and ensuring QoS starvation avoidance.
// =============================================================================

`timescale 1ns / 1ps

module drr_arbiter #(
    parameter NUM_QUEUES    = 4,
    parameter QUANTUM_WIDTH = 12
)(
    input  wire                                clk,
    input  wire                                rst_n,
    input  wire [NUM_QUEUES-1:0]               req,
    input  wire [NUM_QUEUES*16-1:0]            pkt_lengths,
    input  wire [NUM_QUEUES*QUANTUM_WIDTH-1:0] cfg_quantums,
    output reg  [NUM_QUEUES-1:0]               grant,
    output reg                                 grant_valid
);
    reg [QUANTUM_WIDTH+3:0] deficit [0:NUM_QUEUES-1];
    reg [1:0] curr_ptr;
    integer k;

    wire [15:0] pkt_len_array [0:NUM_QUEUES-1];
    wire [QUANTUM_WIDTH-1:0] quantum_array [0:NUM_QUEUES-1];

    genvar g;
    generate
        for (g = 0; g < NUM_QUEUES; g = g + 1) begin : GEN_ARRAYS
            assign pkt_len_array[g] = pkt_lengths[g*16 +: 16];
            assign quantum_array[g] = cfg_quantums[g*QUANTUM_WIDTH +: QUANTUM_WIDTH];
        end
    endgenerate

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            grant       <= {NUM_QUEUES{1'b0}};
            grant_valid <= 1'b0;
            curr_ptr    <= 2'd0;
            for (k = 0; k < NUM_QUEUES; k = k + 1) begin
                deficit[k] <= 0;
            end
        end else begin
            grant       <= {NUM_QUEUES{1'b0}};
            grant_valid <= 1'b0;

            if (|req) begin
                if (req[curr_ptr]) begin
                    if (deficit[curr_ptr] + quantum_array[curr_ptr] >= pkt_len_array[curr_ptr]) begin
                        grant[curr_ptr]   <= 1'b1;
                        grant_valid       <= 1'b1;
                        deficit[curr_ptr] <= (deficit[curr_ptr] + quantum_array[curr_ptr]) - pkt_len_array[curr_ptr];
                        curr_ptr          <= curr_ptr + 1'b1;
                    end else begin
                        deficit[curr_ptr] <= deficit[curr_ptr] + quantum_array[curr_ptr];
                        curr_ptr          <= curr_ptr + 1'b1;
                    end
                end else begin
                    deficit[curr_ptr] <= 0;
                    curr_ptr          <= curr_ptr + 1'b1;
                end
            end
        end
    end
endmodule
