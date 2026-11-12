CXX = g++
CXXFLAGS = -O2 -std=c++17 -Wall -Wextra

TARGET = sim_runner.exe
SRCS = test_main.cpp switch_sim.cpp uvm_scoreboard.cpp
OBJS = $(SRCS:.cpp=.o)

all: $(TARGET)

$(TARGET): $(SRCS)
	$(CXX) $(CXXFLAGS) $(SRCS) -o $(TARGET)

clean:
	rm -f $(TARGET) *.o
