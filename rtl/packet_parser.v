// =============================================================================
// Module: packet_parser.v
// Description: Multi-flit network packet header parser and CRC-32 integrity checker.
//              Extracts destination port, QoS priority level, packet length, and
//              computes running IEEE 802.3 CRC-32 polynomial.
// =============================================================================

`timescale 1ns / 1ps

module packet_parser (
    input  wire        clk,
    input  wire        rst_n,
    input  wire [63:0] flit_data,
    input  wire        flit_valid,
    input  wire        flit_sop,
    input  wire        flit_eop,
    output reg  [1:0]  dest_port,
    output reg  [2:0]  priority_class,
    output reg  [15:0] packet_len,
    output reg  [31:0] calculated_crc,
    output reg         crc_valid,
    output reg         header_valid
);
    // Packet Header Layout:
    // [63:48] : Packet Length in bytes
    // [47:45] : Priority Class (0-7)
    // [44:43] : Destination Port (0-3)
    // [42:32] : Reserved
    // [31:0]  : Sequence / Header Tag

    reg [31:0] crc_state;

    function [31:0] next_crc32;
        input [63:0] data;
        input [31:0] current_crc;
        reg [31:0] c;
        integer i;
        begin
            c = current_crc;
            for (i = 0; i < 64; i = i + 1) begin
                if ((c[31] ^ data[63-i]))
                    c = (c << 1) ^ 32'h04C11DB7;
                else
                    c = (c << 1);
            end
            next_crc32 = c;
        end
    endfunction

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            dest_port      <= 2'd0;
            priority_class <= 3'd0;
            packet_len     <= 16'd0;
            calculated_crc <= 32'hFFFFFFFF;
            crc_valid      <= 1'b0;
            header_valid   <= 1'b0;
            crc_state      <= 32'hFFFFFFFF;
        end else begin
            header_valid <= 1'b0;
            crc_valid    <= 1'b0;

            if (flit_valid) begin
                if (flit_sop) begin
                    packet_len     <= flit_data[63:48];
                    priority_class <= flit_data[47:45];
                    dest_port      <= flit_data[44:43];
                    header_valid   <= 1'b1;
                    crc_state      <= next_crc32(flit_data, 32'hFFFFFFFF);
                end else begin
                    crc_state      <= next_crc32(flit_data, crc_state);
                end

                if (flit_eop) begin
                    calculated_crc <= ~next_crc32(flit_data, crc_state);
                    crc_valid      <= 1'b1;
                end
            end
        end
    end
endmodule
