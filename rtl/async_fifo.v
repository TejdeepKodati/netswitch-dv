// =============================================================================
// Module: async_fifo.v
// Description: Dual-clock Asynchronous Elastic Rate-Adaptation FIFO.
//              Uses Gray code pointers and dual-flop CDC synchronizers to safely
//              cross clock domains between line-rate PHY and switch core clock.
// =============================================================================

`timescale 1ns / 1ps

module async_fifo #(
    parameter DATA_WIDTH = 64,
    parameter ADDR_WIDTH = 4
)(
    input  wire                  wr_clk,
    input  wire                  wr_rst_n,
    input  wire                  wr_en,
    input  wire [DATA_WIDTH-1:0] wr_data,
    output wire                  full,
    output wire [ADDR_WIDTH:0]   wr_credit_count,

    input  wire                  rd_clk,
    input  wire                  rd_rst_n,
    input  wire                  rd_en,
    output reg  [DATA_WIDTH-1:0] rd_data,
    output wire                  empty
);
    localparam DEPTH = 1 << ADDR_WIDTH;

    reg [DATA_WIDTH-1:0] mem [0:DEPTH-1];
    reg [ADDR_WIDTH:0] wr_ptr, rd_ptr;
    wire [ADDR_WIDTH:0] wr_ptr_gray, rd_ptr_gray;
    reg [ADDR_WIDTH:0] wr_ptr_gray_meta, wr_ptr_gray_sync;
    reg [ADDR_WIDTH:0] rd_ptr_gray_meta, rd_ptr_gray_sync;

    // Binary to Gray conversion
    assign wr_ptr_gray = wr_ptr ^ (wr_ptr >> 1);
    assign rd_ptr_gray = rd_ptr ^ (rd_ptr >> 1);

    // Write clock domain logic
    always @(posedge wr_clk or negedge wr_rst_n) begin
        if (!wr_rst_n) begin
            wr_ptr <= 0;
        end else if (wr_en && !full) begin
            mem[wr_ptr[ADDR_WIDTH-1:0]] <= wr_data;
            wr_ptr <= wr_ptr + 1'b1;
        end
    end

    // Synchronize rd_ptr_gray into wr_clk domain (2-stage synchronizer)
    always @(posedge wr_clk or negedge wr_rst_n) begin
        if (!wr_rst_n) begin
            rd_ptr_gray_meta <= 0;
            rd_ptr_gray_sync <= 0;
        end else begin
            rd_ptr_gray_meta <= rd_ptr_gray;
            rd_ptr_gray_sync <= rd_ptr_gray_meta;
        end
    end

    // Read clock domain logic
    always @(posedge rd_clk or negedge rd_rst_n) begin
        if (!rd_rst_n) begin
            rd_ptr  <= 0;
            rd_data <= {DATA_WIDTH{1'b0}};
        end else if (rd_en && !empty) begin
            rd_data <= mem[rd_ptr[ADDR_WIDTH-1:0]];
            rd_ptr  <= rd_ptr + 1'b1;
        end
    end

    // Synchronize wr_ptr_gray into rd_clk domain (2-stage synchronizer)
    always @(posedge rd_clk or negedge rd_rst_n) begin
        if (!rd_rst_n) begin
            wr_ptr_gray_meta <= 0;
            wr_ptr_gray_sync <= 0;
        end else begin
            wr_ptr_gray_meta <= wr_ptr_gray;
            wr_ptr_gray_sync <= wr_ptr_gray_meta;
        end
    end

    // Gray to binary for read pointer in write clock domain
    reg [ADDR_WIDTH:0] rd_ptr_bin_wr;
    integer i;
    always @(*) begin
        rd_ptr_bin_wr[ADDR_WIDTH] = rd_ptr_gray_sync[ADDR_WIDTH];
        for (i = ADDR_WIDTH - 1; i >= 0; i = i - 1) begin
            rd_ptr_bin_wr[i] = rd_ptr_bin_wr[i+1] ^ rd_ptr_gray_sync[i];
        end
    end

    // Full condition: MSB inverted, 2nd MSB inverted, remaining bits match
    assign full = (wr_ptr_gray == {~rd_ptr_gray_sync[ADDR_WIDTH:ADDR_WIDTH-1], rd_ptr_gray_sync[ADDR_WIDTH-2:0]});
    
    // Empty condition: gray pointers identical
    assign empty = (rd_ptr_gray == wr_ptr_gray_sync);

    // Flow control credit computation
    assign wr_credit_count = DEPTH - (wr_ptr - rd_ptr_bin_wr);

endmodule
