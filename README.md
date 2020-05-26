# node-cctalk a succesor of cctalk on npm

## Usage
```
import
```




Node Library to interface coin detectors, bill validators and other peripheral devices speaking the ccTalk protocol

This library aims to provide support for various peripheral devices that use the ccTalk protocol
over a serial line or serial line emulation over USB. This is using serialport for connections and has Contributed the cctalk-parser directly to the serialport project.



## Implamented devices
- src/BillValidators/taiko-pub7.js => Taiko JMC Pub 7 Bill Validator using node-cctalk
- src/CoinAcceptos/emp-800-wh.js => EMP800 wh Münzprüfer Berlin

**TODO** Document API

**TODO** More examples

Disclaimer
----------

ccTalk may be a registered trademark of Money Controls or Crane Payment Innovations.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
